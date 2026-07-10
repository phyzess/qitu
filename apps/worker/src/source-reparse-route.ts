import type { ImportJobMessage } from "@qitu/jobs";
import type { Hono } from "hono";
import { readCurrentUser, requirePermission } from "./auth-routes";
import { authError } from "./http-utils";
import { selectImportAdapter } from "./import-adapters";
import { prepareQueuedImportJobStatements } from "./source-intake-import-job-statements";
import { dispatchSourceImportJob } from "./source-intake-dispatch";
import { readSourceLifecycleRow } from "./source-lifecycle-query";

export function registerSourceReparseRoute(app: Hono<{ Bindings: Env }>): void {
  app.post("/api/source-files/:sourceFileId/reparse", async (context) => {
    const current = await readCurrentUser(context);
    if (!current) {
      return authError(context, "unauthorized", "Login is required.", 401);
    }

    const denied = await requirePermission(context, current, "source_file:reparse");
    if (denied) return denied;

    const source = await readSourceLifecycleRow(context.env, context.req.param("sourceFileId"));
    if (!source) {
      return authError(context, "source_file_not_found", "Source file was not found.", 404);
    }
    if (source.deleted_at) {
      return authError(
        context,
        "source_file_report_only",
        "Deleted source metadata cannot be reparsed.",
        409,
      );
    }
    if (source.deletion_started_at) {
      return authError(
        context,
        "source_deletion_in_progress",
        "Source deletion is in progress and the source cannot be reparsed.",
        409,
      );
    }

    const adapter = selectImportAdapter({
      filename: source.filename,
      contentType: source.content_type,
    });
    if (!adapter) {
      return authError(
        context,
        "unsupported_source_file",
        "No import adapter can handle this source file.",
        415,
      );
    }

    const sourceObject = await context.env.SOURCE_FILES.get(source.object_key);
    if (!sourceObject) {
      return authError(context, "source_object_not_found", "Source object was not found.", 404);
    }
    await sourceObject.body.cancel();

    const importJobId = crypto.randomUUID();
    const queuedAt = new Date().toISOString();
    try {
      await context.env.DB.batch(
        prepareQueuedImportJobStatements(context.env, {
          actor: {
            id: current.user.id,
            kind: "user",
          },
          adapterId: adapter.id,
          contentHash: source.content_hash ?? "",
          contentType: source.content_type,
          filename: source.filename,
          idempotencyKey: `reparse:${source.id}:${importJobId}`,
          importJobId,
          jobKind: adapter.jobKind,
          metadata: {
            reparse: true,
          },
          objectKey: source.object_key,
          size: source.size ?? 0,
          sourceFileId: source.id,
          uploadedAt: queuedAt,
          workspaceId: source.workspace_id,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("source_deletion_in_progress")) {
        return authError(
          context,
          "source_deletion_in_progress",
          "Source deletion started before the reparse job could be queued.",
          409,
        );
      }
      throw error;
    }

    const message: ImportJobMessage = {
      kind: "import.source_file",
      jobId: importJobId,
      sourceFileId: source.id,
      objectKey: source.object_key,
      requestedBy: current.user.id,
    };
    const dispatchFailure = await dispatchSourceImportJob(context.env, {
      jobId: importJobId,
      message,
      objectKey: source.object_key,
      sourceFileId: source.id,
    });
    if (dispatchFailure) {
      return context.json(
        {
          error: {
            code: dispatchFailure.code,
            message: dispatchFailure.message,
          },
          importJobId,
          sourceFileId: source.id,
        },
        dispatchFailure.status,
      );
    }

    return context.json(
      {
        importJobId,
        sourceFileId: source.id,
        status: "queued",
      },
      202,
    );
  });
}

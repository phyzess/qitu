import type { Hono } from "hono";
import * as v from "valibot";
import { readCurrentUser, requirePermission } from "./auth-routes";
import { authError, parseRequestJson, type AppContext } from "./http-utils";
import { deleteSourceFile, type DeleteSourceResult } from "./source-delete-service";

const BatchDeleteSourcesInputSchema = v.object({
  sourceFileIds: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(50)),
});

export function registerSourceDeleteRoutes(app: Hono<{ Bindings: Env }>): void {
  app.delete("/api/source-files/:sourceFileId", async (context) => {
    const current = await requireSourceDeletePermission(context);
    if (!current.ok) return current.response;

    const result = await deleteSourceFile(context.env, {
      actorUserId: current.userId,
      sourceFileId: context.req.param("sourceFileId"),
    });
    return sourceDeleteResponse(context, result);
  });

  app.post("/api/source-files/delete", async (context) => {
    const current = await requireSourceDeletePermission(context);
    if (!current.ok) return current.response;

    const input = await parseRequestJson(context, BatchDeleteSourcesInputSchema);
    if (!input.ok) return input.response;

    const sourceFileIds = [...new Set(input.value.sourceFileIds)];
    const results: DeleteSourceResult[] = [];
    for (const sourceFileId of sourceFileIds) {
      results.push(
        await deleteSourceFile(context.env, {
          actorUserId: current.userId,
          sourceFileId,
        }),
      );
    }

    return context.json({ results });
  });
}

async function requireSourceDeletePermission(
  context: AppContext,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const current = await readCurrentUser(context);
  if (!current) {
    return {
      ok: false,
      response: authError(context, "unauthorized", "Login is required.", 401),
    };
  }

  const denied = await requirePermission(context, current, "source_file:delete");
  return denied ? { ok: false, response: denied } : { ok: true, userId: current.user.id };
}

function sourceDeleteResponse(context: AppContext, result: DeleteSourceResult): Response {
  if (result.status === "not_found") {
    return authError(context, "source_file_not_found", "Source file was not found.", 404);
  }
  if (result.status === "cleanup_not_supported") {
    return context.json(
      {
        error: {
          code: "source_cleanup_not_supported",
          message: "An app-owned adapter must provide source cleanup before deletion.",
          adapterIds: result.adapterIdsWithoutCleanup,
        },
      },
      409,
    );
  }
  if (result.status === "deletion_in_progress") {
    return authError(
      context,
      "source_deletion_in_progress",
      "Source deletion is already in progress.",
      409,
    );
  }
  if (result.status === "mutation_in_progress") {
    return authError(
      context,
      "import_job_mutation_in_progress",
      result.message ?? "An import job mutation must finish before its source can be deleted.",
      409,
    );
  }
  if (result.status === "delete_failed") {
    return context.json(
      {
        error: {
          code: "source_delete_failed",
          message: result.message ?? "Source deletion failed and can be retried.",
          stage: result.failureStage,
          retryable: true,
        },
      },
      502,
    );
  }
  return context.json(result);
}

import { createAuditEvent } from "@qitu/audit";
import type { Hono } from "hono";
import { prepareAuditInsert } from "./audit-store";
import { readCurrentUser, requirePermission } from "./auth-routes";
import { authError, type AppContext } from "./http-utils";
import { readSourceLifecycleRow, type SourceLifecycleRow } from "./source-lifecycle-query";

const SOURCE_PREVIEW_MAX_BYTES = 64 * 1024;

export function registerSourceRawRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/source-files/:sourceFileId/download", async (context) => {
    const target = await readRawSourceTarget(context);
    if (!target.ok) return target.response;

    const object = await context.env.SOURCE_FILES.get(target.source.object_key);
    if (!object) {
      return authError(context, "source_object_not_found", "Source object was not found.", 404);
    }

    await writeRawAccessAudit(context.env, {
      action: "source_file.downloaded",
      actorUserId: target.actorUserId,
      source: target.source,
    });

    const headers = new Headers({
      "cache-control": "private, no-store",
      "content-disposition": contentDisposition(target.source.filename),
      "content-type": target.source.content_type || "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    if (target.source.size !== null) {
      headers.set("content-length", String(target.source.size));
    }

    return new Response(object.body, { headers });
  });

  app.get("/api/source-files/:sourceFileId/preview", async (context) => {
    const target = await readRawSourceTarget(context);
    if (!target.ok) return target.response;
    if (!isTextPreviewType(target.source.content_type)) {
      return authError(
        context,
        "source_preview_unsupported",
        "Only text-based source files can be previewed.",
        415,
      );
    }

    const object = await context.env.SOURCE_FILES.get(target.source.object_key);
    if (!object) {
      return authError(context, "source_object_not_found", "Source object was not found.", 404);
    }

    const preview = await readBoundedPreview(object.body, SOURCE_PREVIEW_MAX_BYTES);
    await writeRawAccessAudit(context.env, {
      action: "source_file.previewed",
      actorUserId: target.actorUserId,
      source: target.source,
      metadata: {
        maxBytes: SOURCE_PREVIEW_MAX_BYTES,
        truncated: preview.truncated,
      },
    });

    return context.json(
      {
        sourceFileId: target.source.id,
        contentType: target.source.content_type,
        text: new TextDecoder().decode(preview.bytes),
        truncated: preview.truncated,
        maxBytes: SOURCE_PREVIEW_MAX_BYTES,
      },
      200,
      {
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    );
  });
}

async function readRawSourceTarget(
  context: AppContext,
): Promise<
  { ok: true; actorUserId: string; source: SourceLifecycleRow } | { ok: false; response: Response }
> {
  const current = await readCurrentUser(context);
  if (!current) {
    return {
      ok: false,
      response: authError(context, "unauthorized", "Login is required.", 401),
    };
  }

  const denied = await requirePermission(context, current, "source_file:raw");
  if (denied) {
    return { ok: false, response: denied };
  }

  const sourceFileId = context.req.param("sourceFileId");
  if (!sourceFileId) {
    return {
      ok: false,
      response: authError(context, "source_file_not_found", "Source file was not found.", 404),
    };
  }

  const source = await readSourceLifecycleRow(context.env, sourceFileId);
  if (!source) {
    return {
      ok: false,
      response: authError(context, "source_file_not_found", "Source file was not found.", 404),
    };
  }
  if (source.deleted_at) {
    return {
      ok: false,
      response: authError(
        context,
        "source_file_report_only",
        "Deleted source metadata is report-only; raw content is no longer available.",
        410,
      ),
    };
  }
  if (source.deletion_started_at) {
    return {
      ok: false,
      response: authError(
        context,
        "source_deletion_in_progress",
        "Source deletion is in progress; raw content is unavailable.",
        409,
      ),
    };
  }

  return {
    ok: true,
    actorUserId: current.user.id,
    source,
  };
}

async function readBoundedPreview(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (total <= maxBytes) {
      const next = await reader.read();
      if (next.done) break;

      const remaining = maxBytes + 1 - total;
      const chunk = next.value.subarray(0, remaining);
      chunks.push(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < next.value.byteLength || total > maxBytes) {
        truncated = true;
        break;
      }
    }
  } finally {
    if (truncated) {
      await reader.cancel();
    } else {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const copy = chunk.subarray(0, bytes.byteLength - offset);
    bytes.set(copy, offset);
    offset += copy.byteLength;
    if (offset === bytes.byteLength) break;
  }

  return { bytes, truncated };
}

function isTextPreviewType(contentType: string): boolean {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return (
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized.endsWith("+json") ||
    normalized === "application/xml" ||
    normalized.endsWith("+xml")
  );
}

function contentDisposition(filename: string): string {
  const asciiFallback =
    filename
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_") || "source-file";
  const encodedFilename = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

async function writeRawAccessAudit(
  env: Env,
  input: {
    action: "source_file.downloaded" | "source_file.previewed";
    actorUserId: string;
    metadata?: Record<string, unknown>;
    source: SourceLifecycleRow;
  },
): Promise<void> {
  await prepareAuditInsert(
    env,
    createAuditEvent({
      action: input.action,
      actor: {
        id: input.actorUserId,
        kind: "user",
      },
      subject: {
        id: input.source.id,
        kind: "source_file",
      },
      metadata: {
        contentType: input.source.content_type,
        filename: input.source.filename,
        ...input.metadata,
      },
    }),
  ).run();
}

import { createAuditEvent } from "@qitu/audit";
import { buildSourceFileKey, hashSourceContent } from "@qitu/files";
import type { ImportJobMessage } from "@qitu/jobs";
import { prepareAuditInsert } from "./audit-store";
import { prepareImportJobEventInsert } from "./event-store";
import { selectImportAdapter } from "./import-adapters";
import { markImportJobFailed } from "./import-job-runner";

type DuplicateSourceFileRow = {
  source_file_id: string;
  object_key: string;
  import_job_id: string | null;
  status: string | null;
};

export type SourceIntakeActor = {
  id: string;
  kind: "system" | "user";
};

export type SourceIntakeInput = {
  actor: SourceIntakeActor;
  content: ArrayBuffer;
  contentType: string;
  filename: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null | undefined;
  workspaceId: string;
};

export type SourceIntakeResult =
  | {
      duplicate: boolean;
      importJobId: string | null;
      objectKey: string;
      ok: true;
      sourceFileId: string;
      status: string | null;
    }
  | {
      code: "queue_dispatch_failed" | "unsupported_source_file";
      importJobId?: string;
      message: string;
      objectKey?: string;
      ok: false;
      sourceFileId?: string;
      status: 415 | 503;
    };

export async function createSourceFileImportJob(
  env: Env,
  input: SourceIntakeInput,
): Promise<SourceIntakeResult> {
  const adapter = selectImportAdapter({
    contentType: input.contentType,
    filename: input.filename,
  });
  if (!adapter) {
    return {
      code: "unsupported_source_file",
      message: "No import adapter can handle this source file.",
      ok: false,
      status: 415,
    };
  }

  const sourceFileId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const size = input.content.byteLength;
  const contentHash = await hashSourceContent(input.content);
  const idempotencyKey = `${input.workspaceId}:${contentHash}`;
  const now = new Date().toISOString();
  const duplicate = await findDuplicateSourceFile(env, {
    contentHash,
    workspaceId: input.workspaceId,
  });

  if (duplicate) {
    return {
      duplicate: true,
      importJobId: duplicate.import_job_id,
      objectKey: duplicate.object_key,
      ok: true,
      sourceFileId: duplicate.source_file_id,
      status: duplicate.status,
    };
  }

  const objectKey = buildSourceFileKey({
    filename: input.filename,
    sourceFileId,
    workspaceId: input.workspaceId,
  });

  await env.SOURCE_FILES.put(objectKey, input.content, {
    customMetadata: {
      contentHash,
      uploadedBy: input.actor.id,
    },
    httpMetadata: {
      contentType: input.contentType,
    },
  });

  const message: ImportJobMessage = {
    jobId,
    kind: "import.source_file",
    objectKey,
    requestedBy: input.actor.id,
    sourceFileId,
  };

  try {
    await env.DB.batch([
      env.DB.prepare(
        `
          INSERT INTO source_files (
            id, workspace_id, object_key, filename, content_type, content_hash, size, uploaded_by, uploaded_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        sourceFileId,
        input.workspaceId,
        objectKey,
        input.filename,
        input.contentType,
        contentHash,
        size,
        input.actor.id,
        now,
      ),
      env.DB.prepare(
        `
          INSERT INTO import_jobs (
            id,
            source_file_id,
            status,
            job_kind,
            adapter_id,
            idempotency_key,
            attempt_count,
            created_by,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        jobId,
        sourceFileId,
        "queued",
        adapter.jobKind,
        adapter.id,
        idempotencyKey,
        0,
        input.actor.id,
        now,
        now,
      ),
      prepareAuditInsert(
        env,
        createAuditEvent({
          action: "source_file.uploaded",
          actor: input.actor,
          metadata: {
            adapterId: adapter.id,
            contentHash,
            contentType: input.contentType,
            filename: input.filename,
            importJobId: jobId,
            objectKey,
            workspaceId: input.workspaceId,
            ...input.metadata,
          },
          subject: {
            id: sourceFileId,
            kind: "source_file",
          },
        }),
      ),
      prepareImportJobEventInsert(env, {
        actorUserId: input.actor.kind === "user" ? input.actor.id : null,
        createdAt: now,
        eventType: "source_file.uploaded",
        importJobId: jobId,
        message: "Source file stored.",
        metadata: {
          contentHash,
          contentType: input.contentType,
          filename: input.filename,
          workspaceId: input.workspaceId,
          ...input.metadata,
        },
        requestId: input.requestId ?? null,
        sourceFileId,
        statusTo: "stored",
      }),
      prepareAuditInsert(
        env,
        createAuditEvent({
          action: "import_job.queued",
          actor: input.actor,
          metadata: {
            adapterId: adapter.id,
            jobKind: adapter.jobKind,
            objectKey,
            sourceFileId,
            ...input.metadata,
          },
          subject: {
            id: jobId,
            kind: "import_job",
          },
        }),
      ),
      prepareImportJobEventInsert(env, {
        actorUserId: input.actor.kind === "user" ? input.actor.id : null,
        createdAt: now,
        eventType: "import_job.queued",
        importJobId: jobId,
        message: "Import job queued.",
        metadata: {
          adapterId: adapter.id,
          jobKind: adapter.jobKind,
          objectKey,
          ...input.metadata,
        },
        requestId: input.requestId ?? null,
        sourceFileId,
        statusTo: "queued",
      }),
    ]);
  } catch (error) {
    await env.SOURCE_FILES.delete(objectKey);
    throw error;
  }

  try {
    await env.IMPORT_JOBS.send(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Queue dispatch failed.";
    await markImportJobFailed(env, {
      action: "import_job.dispatch_failed",
      failureClass: "queue_dispatch",
      jobId,
      reason,
      sourceFileId,
    });

    return {
      code: "queue_dispatch_failed",
      importJobId: jobId,
      message: "Source file was stored, but import job dispatch failed.",
      objectKey,
      ok: false,
      sourceFileId,
      status: 503,
    };
  }

  return {
    duplicate: false,
    importJobId: jobId,
    objectKey,
    ok: true,
    sourceFileId,
    status: "queued",
  };
}

async function findDuplicateSourceFile(
  env: Env,
  input: {
    contentHash: string;
    workspaceId: string;
  },
): Promise<DuplicateSourceFileRow | null> {
  return env.DB.prepare(
    `
      SELECT
        source_files.id AS source_file_id,
        source_files.object_key,
        import_jobs.id AS import_job_id,
        import_jobs.status
      FROM source_files
      LEFT JOIN import_jobs ON import_jobs.source_file_id = source_files.id
      WHERE source_files.workspace_id = ? AND source_files.content_hash = ?
      ORDER BY source_files.uploaded_at DESC
      LIMIT 1
    `,
  )
    .bind(input.workspaceId, input.contentHash)
    .first<DuplicateSourceFileRow>();
}

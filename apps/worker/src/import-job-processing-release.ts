import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import type { ImportJobWriteGuard } from "./import-job-write-guard";

export async function releaseImportJobProcessingLease(
  env: Env,
  input: {
    importJobId: string;
    processingOwner: string;
    processingStartedAt: string;
    reason: string;
    sourceFileId: string;
  },
): Promise<boolean> {
  const releasedAt = new Date().toISOString();
  const update = env.DB.prepare(
    `
      UPDATE import_jobs
      SET
        status = 'queued',
        processing_lease_expires_at = NULL,
        completed_at = NULL,
        failure_reason = NULL,
        failure_class = NULL,
        updated_at = ?
      WHERE id = ?
        AND status = 'processing'
        AND processing_started_at = ?
        AND processing_owner = ?
        AND EXISTS (
          SELECT 1
          FROM source_files
          WHERE source_files.id = import_jobs.source_file_id
            AND source_files.deletion_started_at IS NULL
            AND source_files.deleted_at IS NULL
        )
    `,
  ).bind(releasedAt, input.importJobId, input.processingStartedAt, input.processingOwner);
  const writeGuard: ImportJobWriteGuard = {
    importJobId: input.importJobId,
    processingOwner: input.processingOwner,
    processingStartedAt: input.processingStartedAt,
    status: "queued",
    updatedAt: releasedAt,
  };
  const [result] = await env.DB.batch([
    update,
    prepareImportJobEventInsert(
      env,
      {
        importJobId: input.importJobId,
        sourceFileId: input.sourceFileId,
        eventType: "import_job.fast_path_released",
        statusFrom: "processing",
        statusTo: "queued",
        message: "Fast-path processing released its lease to the Queue fallback.",
        createdAt: releasedAt,
        metadata: { reason: input.reason },
      },
      writeGuard,
    ),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: "import_job.fast_path_released",
        actor: { id: "wait_until", kind: "system" },
        subject: { id: input.importJobId, kind: "import_job" },
        metadata: {
          processingStartedAt: input.processingStartedAt,
          reason: input.reason,
          sourceFileId: input.sourceFileId,
        },
      }),
      writeGuard,
    ),
  ]);

  if ((result?.meta.changes ?? 0) === 0) return false;

  return true;
}

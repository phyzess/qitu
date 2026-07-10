import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import type { ImportProcessingJobRow } from "./import-job-processing-read";
import type { ImportJobWriteGuard } from "./import-job-write-guard";

export async function reclaimStaleImportDispatchMutation(
  env: Env,
  job: ImportProcessingJobRow,
): Promise<boolean> {
  if (
    job.status !== "queued" ||
    !job.mutation_token ||
    (job.mutation_kind !== "retry" && job.mutation_kind !== "redispatch")
  ) {
    return false;
  }

  const reclaimedAt = new Date().toISOString();
  const recoveryToken = `dispatch-recovery:${crypto.randomUUID()}`;
  const update = env.DB.prepare(
    `
      UPDATE import_jobs
      SET
        mutation_token = ?,
        mutation_started_at = ?,
        mutation_kind = 'dispatch_recovery',
        mutation_previous_status = 'queued',
        updated_at = ?
      WHERE id = ?
        AND status = 'queued'
        AND mutation_token = ?
        AND mutation_kind = ?
        AND EXISTS (
          SELECT 1
          FROM source_files
          WHERE source_files.id = import_jobs.source_file_id
            AND source_files.deletion_started_at IS NULL
            AND source_files.deleted_at IS NULL
        )
    `,
  ).bind(recoveryToken, reclaimedAt, reclaimedAt, job.id, job.mutation_token, job.mutation_kind);
  const writeGuard: ImportJobWriteGuard = {
    importJobId: job.id,
    mutationToken: recoveryToken,
    processingStartedAt: job.processing_started_at,
    status: "queued",
    updatedAt: reclaimedAt,
  };
  const [result] = await env.DB.batch([
    update,
    prepareImportJobEventInsert(
      env,
      {
        importJobId: job.id,
        sourceFileId: job.source_file_id,
        eventType: "import_job.dispatch_claim_reclaimed",
        statusFrom: "queued",
        statusTo: "queued",
        message: "A stale dispatch mutation claim was reclaimed by Queue processing.",
        createdAt: reclaimedAt,
        metadata: {
          previousMutationKind: job.mutation_kind,
          previousMutationStartedAt: job.mutation_started_at,
        },
      },
      writeGuard,
    ),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: "import_job.dispatch_claim_reclaimed",
        actor: { id: "queue", kind: "system" },
        subject: { id: job.id, kind: "import_job" },
        metadata: {
          previousMutationKind: job.mutation_kind,
          previousMutationStartedAt: job.mutation_started_at,
          sourceFileId: job.source_file_id,
        },
      }),
      writeGuard,
    ),
    env.DB.prepare(
      `
        UPDATE import_jobs
        SET
          mutation_token = NULL,
          mutation_started_at = NULL,
          mutation_kind = NULL,
          mutation_previous_status = NULL
        WHERE id = ? AND status = 'queued' AND mutation_token = ?
      `,
    ).bind(job.id, recoveryToken),
  ]);

  return (result?.meta.changes ?? 0) > 0;
}

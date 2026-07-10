import { createAuditEvent } from "@qitu/audit";
import type { ImportFailureClass } from "@qitu/import-pipeline";
import { prepareAuditInsert } from "./audit-store";
import { prepareAlertEventInsert } from "./event-store";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import type { ImportJobWriteGuard } from "./import-job-write-guard";

export async function markImportJobFailed(
  env: Env,
  input: {
    jobId: string;
    sourceFileId?: string | null | undefined;
    reason: string;
    action: string;
    failureClass?: ImportFailureClass | undefined;
    expectedStatus?: string | undefined;
    processingStartedAt?: string | undefined;
    processingOwner?: string | undefined;
  },
): Promise<boolean> {
  const now = new Date().toISOString();
  const failureClass = input.failureClass ?? "infrastructure";
  const failureTransition = `failure:${crypto.randomUUID()}`;
  const update = env.DB.prepare(
    `
      UPDATE import_jobs
      SET
        status = 'failed',
        failure_reason = ?,
        failure_class = ?,
        processing_started_at = ?,
        processing_owner = ?,
        processing_lease_expires_at = NULL,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
        AND (? IS NULL OR status = ?)
        AND (? IS NULL OR processing_started_at = ?)
        AND (? IS NULL OR processing_owner = ?)
        AND EXISTS (
          SELECT 1
          FROM source_files
          WHERE source_files.id = import_jobs.source_file_id
            AND source_files.deletion_started_at IS NULL
            AND source_files.deleted_at IS NULL
        )
    `,
  ).bind(
    input.reason,
    failureClass,
    input.processingStartedAt ?? null,
    failureTransition,
    now,
    now,
    input.jobId,
    input.expectedStatus ?? null,
    input.expectedStatus ?? null,
    input.processingStartedAt ?? null,
    input.processingStartedAt ?? null,
    input.processingOwner ?? null,
    input.processingOwner ?? null,
  );
  const writeGuard: ImportJobWriteGuard = {
    importJobId: input.jobId,
    processingOwner: failureTransition,
    processingStartedAt: input.processingStartedAt ?? null,
    status: "failed",
    updatedAt: now,
  };
  const [result] = await env.DB.batch([
    update,
    prepareImportJobEventInsert(
      env,
      {
        importJobId: input.jobId,
        sourceFileId: input.sourceFileId ?? null,
        eventType: input.action,
        statusFrom: input.expectedStatus ?? null,
        statusTo: "failed",
        message: input.reason,
        createdAt: now,
        metadata: {
          failureClass,
        },
      },
      writeGuard,
    ),
    prepareAlertEventInsert(
      env,
      {
        severity:
          failureClass === "infrastructure" || failureClass === "queue_dispatch"
            ? "critical"
            : "warning",
        alertType: "import_job.failed",
        entityType: "import_job",
        entityId: input.jobId,
        title: "Import job failed",
        message: input.reason,
        createdAt: now,
        metadata: {
          action: input.action,
          failureClass,
          sourceFileId: input.sourceFileId ?? null,
        },
      },
      writeGuard,
    ),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: input.action,
        actor: {
          id: "queue",
          kind: "system",
        },
        subject: {
          id: input.jobId,
          kind: "import_job",
        },
        metadata: {
          reason: input.reason,
          failureClass,
        },
      }),
      writeGuard,
    ),
    env.DB.prepare(
      `
        UPDATE import_jobs
        SET processing_owner = NULL
        WHERE id = ? AND status = 'failed' AND processing_owner = ?
      `,
    ).bind(input.jobId, failureTransition),
  ]);

  if ((result?.meta.changes ?? 0) === 0) return false;

  return true;
}

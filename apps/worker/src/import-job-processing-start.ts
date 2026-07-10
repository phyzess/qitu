import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import type { ImportJobWriteGuard } from "./import-job-write-guard";

export const FAST_IMPORT_PROCESSING_LEASE_MS = 30_000;
export const QUEUE_IMPORT_PROCESSING_LEASE_MS = 15 * 60 * 1_000;

export type ImportJobProcessingClaimResult =
  | { claimed: true; processingOwner: string; processingStartedAt: string }
  | { claimed: false };

export async function markImportJobProcessingStarted(
  env: Env,
  input: {
    adapterId: string;
    jobId: string;
    objectKey: string;
    previousProcessingStartedAt: string | null;
    sourceFileId: string;
    startedAt: string;
    statusFrom: "processing" | "queued";
    mode: "fast" | "queue";
  },
): Promise<ImportJobProcessingClaimResult> {
  const leaseDuration =
    input.mode === "fast" ? FAST_IMPORT_PROCESSING_LEASE_MS : QUEUE_IMPORT_PROCESSING_LEASE_MS;
  const leaseExpiresAt = new Date(Date.parse(input.startedAt) + leaseDuration).toISOString();
  const processingOwner = `${input.mode}:${crypto.randomUUID()}`;
  const processingUpdate = env.DB.prepare(
    `
      UPDATE import_jobs
      SET
        status = 'processing',
        processing_started_at = ?,
        processing_owner = ?,
        processing_lease_expires_at = ?,
        completed_at = NULL,
        failure_reason = NULL,
        failure_class = NULL,
        updated_at = ?,
        attempt_count = COALESCE(attempt_count, 0) + 1
      WHERE id = ?
        AND status = ?
        AND mutation_token IS NULL
        AND (
          (? IS NULL AND processing_started_at IS NULL)
          OR processing_started_at = ?
        )
        AND EXISTS (
          SELECT 1
          FROM source_files
          WHERE source_files.id = import_jobs.source_file_id
            AND source_files.deletion_started_at IS NULL
            AND source_files.deleted_at IS NULL
        )
    `,
  ).bind(
    input.startedAt,
    processingOwner,
    leaseExpiresAt,
    input.startedAt,
    input.jobId,
    input.statusFrom,
    input.previousProcessingStartedAt,
    input.previousProcessingStartedAt,
  );
  const restarted = input.statusFrom === "processing";
  const writeGuard: ImportJobWriteGuard = {
    importJobId: input.jobId,
    processingOwner,
    processingStartedAt: input.startedAt,
    status: "processing",
    updatedAt: input.startedAt,
  };
  const [processingResult] = await env.DB.batch([
    processingUpdate,
    prepareImportJobEventInsert(
      env,
      {
        importJobId: input.jobId,
        sourceFileId: input.sourceFileId,
        eventType: restarted ? "import_job.processing_restarted" : "import_job.processing_started",
        statusFrom: input.statusFrom,
        statusTo: "processing",
        message: restarted
          ? "Import job processing restarted after its previous lease expired."
          : "Import job processing started.",
        createdAt: input.startedAt,
        metadata: {
          objectKey: input.objectKey,
          adapterId: input.adapterId,
          previousProcessingStartedAt: input.previousProcessingStartedAt,
          processingMode: input.mode,
          processingOwner,
          processingLeaseExpiresAt: leaseExpiresAt,
        },
      },
      writeGuard,
    ),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: restarted ? "import_job.processing_restarted" : "import_job.processing_started",
        actor: {
          id: "queue",
          kind: "system",
        },
        subject: {
          id: input.jobId,
          kind: "import_job",
        },
        metadata: {
          sourceFileId: input.sourceFileId,
          objectKey: input.objectKey,
          adapterId: input.adapterId,
          previousProcessingStartedAt: input.previousProcessingStartedAt,
          processingMode: input.mode,
          processingOwner,
          processingLeaseExpiresAt: leaseExpiresAt,
        },
      }),
      writeGuard,
    ),
  ]);

  if ((processingResult?.meta.changes ?? 0) === 0) {
    return { claimed: false };
  }

  return { claimed: true, processingOwner, processingStartedAt: input.startedAt };
}

export function importJobProcessingRetryDelaySeconds(
  processingLeaseExpiresAt: string | null,
  now = Date.now(),
): number {
  const expiresAt = processingLeaseExpiresAt ? Date.parse(processingLeaseExpiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAt)) return 0;

  const remainingMilliseconds = expiresAt - now;
  if (remainingMilliseconds <= 0) return 0;

  return Math.ceil(remainingMilliseconds / 1_000) + 1;
}

import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import type { WorkerImportAdapter } from "./import-adapters";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

export function prepareImportJobNeedsReviewStatements(
  env: Env,
  input: {
    adapter: WorkerImportAdapter;
    importJobId: string;
    objectKey: string;
    sourceFileId: string;
    stagedAt: string;
    stagedCount: number;
    writeGuard: ImportJobWriteGuard;
  },
): D1PreparedStatement[] {
  const needsReviewGuard: ImportJobWriteGuard = {
    importJobId: input.writeGuard.importJobId,
    processingStartedAt: input.writeGuard.processingStartedAt,
    status: "needs_review",
  };
  return [
    env.DB.prepare(
      `
        UPDATE import_jobs
        SET
          status = 'needs_review',
          processing_owner = NULL,
          processing_lease_expires_at = NULL,
          completed_at = ?,
          updated_at = ?
        WHERE id = ?
          AND status = ?
          AND processing_started_at = ?
          AND ${activeImportJobGuardSql()}
      `,
    ).bind(
      input.stagedAt,
      input.stagedAt,
      input.importJobId,
      input.writeGuard.status,
      input.writeGuard.processingStartedAt,
      ...importJobWriteGuardBindings(input.writeGuard),
    ),
    prepareImportJobEventInsert(
      env,
      {
        importJobId: input.importJobId,
        sourceFileId: input.sourceFileId,
        eventType: "import_job.needs_review",
        statusFrom: "processing",
        statusTo: "needs_review",
        message: "Import job is ready for human confirmation.",
        createdAt: input.stagedAt,
        metadata: {
          objectKey: input.objectKey,
          adapterId: input.adapter.id,
          stagedCount: input.stagedCount,
        },
      },
      needsReviewGuard,
    ),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: "import_job.needs_review",
        actor: {
          id: "queue",
          kind: "system",
        },
        subject: {
          id: input.importJobId,
          kind: "import_job",
        },
        metadata: {
          sourceFileId: input.sourceFileId,
          objectKey: input.objectKey,
          adapterId: input.adapter.id,
          stagedCount: input.stagedCount,
        },
      }),
      needsReviewGuard,
    ),
  ];
}

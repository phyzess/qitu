import { prepareImportJobEventInsert } from "./import-job-event-store";
import type { ImportJobReviewRow } from "./import-review-row-types";
import type { StoredStagedRecordRow } from "./import-review-store";
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

export function prepareConfirmPendingJobStatements(
  env: Env,
  input: {
    actorKind: "system" | "user";
    automatic: boolean;
    confirmedAt: string;
    currentUserId: string;
    decisionId: string;
    job: ImportJobReviewRow;
    jobId: string;
    jobStatus: string;
    pendingRecords: StoredStagedRecordRow[];
    requestedByUserId?: string;
    targetStatus: string;
    writeGuard?: ImportJobWriteGuard;
  },
): D1PreparedStatement[] {
  const update = env.DB.prepare(
    `
      UPDATE import_jobs
      SET status = ?, updated_at = ?
      WHERE id = ?
        ${input.writeGuard ? `AND ${activeImportJobGuardSql()}` : ""}
    `,
  );
  const updatedGuard = input.writeGuard
    ? { ...input.writeGuard, status: input.jobStatus }
    : undefined;
  return [
    input.writeGuard
      ? update.bind(
          input.jobStatus,
          input.confirmedAt,
          input.jobId,
          ...importJobWriteGuardBindings(input.writeGuard),
        )
      : update.bind(input.jobStatus, input.confirmedAt, input.jobId),
    prepareImportJobEventInsert(
      env,
      {
        importJobId: input.jobId,
        sourceFileId: input.job.source_file_id,
        eventType: "import_review.records_approved",
        statusTo: input.jobStatus,
        actorUserId: input.actorKind === "user" ? input.currentUserId : null,
        message: "Pending staged records approved.",
        createdAt: input.confirmedAt,
        metadata: {
          decisionId: input.decisionId,
          confirmedCount: input.pendingRecords.length,
          stagedRecordKeys: input.pendingRecords.map((record) => record.staged_record_key),
          targetReviewStatus: input.targetStatus,
          automatic: input.automatic,
          executedBy: input.currentUserId,
          requestedByUserId: input.requestedByUserId ?? null,
        },
      },
      updatedGuard,
    ),
  ];
}

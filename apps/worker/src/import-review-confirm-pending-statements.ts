import type { ReviewRecordDecisionAction } from "@qitu/import-pipeline";
import type { WorkerImportAdapter } from "./import-adapters";
import { prepareConfirmPendingDecisionStatement } from "./import-review-confirm-pending-decision-statements";
import { prepareConfirmPendingJobStatements } from "./import-review-confirm-pending-job-statements";
import { prepareConfirmPendingRecordStatements } from "./import-review-confirm-pending-record-statements";
import type { ImportJobReviewRow } from "./import-review-row-types";
import type { StoredStagedRecordRow } from "./import-review-store";
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  prepareImportJobWriteGuardAssertion,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

export function prepareConfirmPendingReviewStatements(
  env: Env,
  input: {
    action: ReviewRecordDecisionAction;
    actorKind: "system" | "user";
    adapter: WorkerImportAdapter;
    automatic: boolean;
    confirmedAt: string;
    currentUserId: string;
    decisionId: string;
    job: ImportJobReviewRow;
    jobId: string;
    jobStatus: string;
    note: string | null;
    pendingRecords: StoredStagedRecordRow[];
    requestedByUserId?: string;
    targetStatus: string;
    writeGuard?: ImportJobWriteGuard;
  },
): D1PreparedStatement[] {
  const acceptManualIssues = env.DB.prepare(
    `
      UPDATE import_review_issues
      SET status = 'accepted'
      WHERE import_job_id = ?
        AND code = 'manual_review_required'
        AND status = 'open'
        ${input.writeGuard ? `AND ${activeImportJobGuardSql()}` : ""}
    `,
  );
  return [
    ...(input.writeGuard ? [prepareImportJobWriteGuardAssertion(env, input.writeGuard)] : []),
    ...(input.automatic
      ? [
          input.writeGuard
            ? acceptManualIssues.bind(input.jobId, ...importJobWriteGuardBindings(input.writeGuard))
            : acceptManualIssues.bind(input.jobId),
        ]
      : []),
    prepareConfirmPendingDecisionStatement(env, {
      action: input.action,
      confirmedAt: input.confirmedAt,
      currentUserId: input.currentUserId,
      decisionId: input.decisionId,
      jobId: input.jobId,
      note: input.note,
      ...(input.writeGuard ? { writeGuard: input.writeGuard } : {}),
    }),
    ...input.pendingRecords.flatMap((record) =>
      prepareConfirmPendingRecordStatements(env, {
        action: input.action,
        actorKind: input.actorKind,
        adapter: input.adapter,
        automatic: input.automatic,
        confirmedAt: input.confirmedAt,
        currentUserId: input.currentUserId,
        decisionId: input.decisionId,
        jobId: input.jobId,
        note: input.note,
        record,
        ...(input.requestedByUserId ? { requestedByUserId: input.requestedByUserId } : {}),
        targetStatus: input.targetStatus,
        ...(input.writeGuard ? { writeGuard: input.writeGuard } : {}),
      }),
    ),
    ...prepareConfirmPendingJobStatements(env, {
      confirmedAt: input.confirmedAt,
      actorKind: input.actorKind,
      currentUserId: input.currentUserId,
      decisionId: input.decisionId,
      automatic: input.automatic,
      job: input.job,
      jobId: input.jobId,
      jobStatus: input.jobStatus,
      pendingRecords: input.pendingRecords,
      ...(input.requestedByUserId ? { requestedByUserId: input.requestedByUserId } : {}),
      targetStatus: input.targetStatus,
      ...(input.writeGuard ? { writeGuard: input.writeGuard } : {}),
    }),
  ];
}

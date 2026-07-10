import type { ReviewRecordDecisionAction, StagedRecordStatus } from "@qitu/import-pipeline";
import type { CurrentUser } from "./auth-types";
import type { AppContext } from "./http-utils";
import type { WorkerImportAdapter } from "./import-adapters";
import { prepareOpenErrorOverrideStatements } from "./import-review-error-override-statements";
import { prepareReviewDecisionLedgerStatements } from "./import-review-decision-ledger-statements";
import { prepareReviewRecordDecisionOutcomeStatements } from "./import-review-decision-outcome-statements";
import { readImportJobStatusAfterRecordDecision } from "./import-review-status";
import type { StoredStagedRecordRow } from "./import-review-store";
import type { ImportReviewIssueRow } from "./import-review-row-types";
import {
  prepareImportJobWriteGuardAssertion,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

export async function writeReviewRecordDecision(input: {
  action: ReviewRecordDecisionAction;
  acceptedOpenErrors: ImportReviewIssueRow[];
  adapter: WorkerImportAdapter;
  context: AppContext;
  current: CurrentUser;
  jobId: string;
  note: string | null;
  record: StoredStagedRecordRow;
  targetStatus: Extract<StagedRecordStatus, "approved" | "rejected">;
  writeGuard?: ImportJobWriteGuard;
}): Promise<{ decidedAt: string; record: StoredStagedRecordRow; status: string }> {
  const {
    acceptedOpenErrors,
    action,
    adapter,
    context,
    current,
    jobId,
    note,
    record,
    targetStatus,
    writeGuard,
  } = input;
  const decidedAt = new Date().toISOString();
  const decisionId = crypto.randomUUID();
  const recordDecisionId = crypto.randomUUID();
  const jobStatus = await readImportJobStatusAfterRecordDecision(context.env, {
    importJobId: jobId,
    reviewStore: adapter.reviewStore,
    currentStatus: record.review_status,
    targetStatus,
  });

  await context.env.DB.batch([
    ...(writeGuard ? [prepareImportJobWriteGuardAssertion(context.env, writeGuard)] : []),
    ...prepareReviewDecisionLedgerStatements(context.env, {
      action,
      decidedAt,
      decisionId,
      importJobId: jobId,
      note,
      recordDecisionId,
      reviewerUserId: current.user.id,
      stagedRecordKey: record.staged_record_key,
    }),
    ...prepareOpenErrorOverrideStatements(context.env, {
      acceptedAt: decidedAt,
      actorUserId: current.user.id,
      adapter,
      decisionId,
      importJobId: jobId,
      issues: acceptedOpenErrors,
      record,
    }),
    ...prepareReviewRecordDecisionOutcomeStatements(context.env, {
      adapter,
      actorUserId: current.user.id,
      decidedAt,
      decisionId,
      importJobId: jobId,
      jobStatus,
      record,
      recordDecisionId,
      targetStatus,
      acceptedOpenErrorCount: acceptedOpenErrors.length,
    }),
  ]);

  return {
    decidedAt,
    record: {
      ...record,
      review_status: targetStatus,
      updated_at: decidedAt,
    },
    status: jobStatus,
  };
}

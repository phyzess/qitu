import {
  stagedStatusForReviewAction,
  type ReviewRecordDecisionAction,
} from "@qitu/import-pipeline";
import type { WorkerImportAdapter } from "./import-adapters";
import { prepareConfirmPendingReviewStatements } from "./import-review-confirm-pending-statements";
import type { ImportJobReviewRow } from "./import-review-row-types";
import {
  adjustReviewStatus,
  jobStatusForReviewSummary,
  readReviewStatusSummary,
} from "./import-review-status";
import type { StoredStagedRecordRow } from "./import-review-store";
import { importJobMatchesWriteGuard, type ImportJobWriteGuard } from "./import-job-write-guard";

export async function writeConfirmPendingReviewRecords(input: {
  actorKind?: "system" | "user";
  actorUserId: string;
  adapter: WorkerImportAdapter;
  automatic?: boolean;
  env: Env;
  job: ImportJobReviewRow;
  jobId: string;
  jobStatusOverride?: string;
  note: string | null;
  pendingRecords: StoredStagedRecordRow[];
  requestedByUserId?: string;
  writeGuard?: ImportJobWriteGuard;
}): Promise<{
  confirmedCount: number;
  records: StoredStagedRecordRow[];
  status: string;
}> {
  const {
    actorKind = "user",
    actorUserId,
    adapter,
    automatic = false,
    env,
    job,
    jobId,
    jobStatusOverride,
    note,
    pendingRecords,
    requestedByUserId,
    writeGuard,
  } = input;
  const confirmedAt = new Date().toISOString();
  const action: ReviewRecordDecisionAction = "approve";
  const targetStatus = stagedStatusForReviewAction(action);
  const decisionId = crypto.randomUUID();
  const summary = await readReviewStatusSummary(env, adapter.reviewStore, jobId);
  adjustReviewStatus(summary, "pending", -pendingRecords.length);
  adjustReviewStatus(summary, targetStatus, pendingRecords.length);
  const jobStatus = jobStatusOverride ?? jobStatusForReviewSummary(summary);
  const updatedRecords = pendingRecords.map((record) => ({
    ...record,
    review_status: targetStatus,
    updated_at: confirmedAt,
  }));

  await env.DB.batch(
    prepareConfirmPendingReviewStatements(env, {
      action,
      actorKind,
      adapter,
      automatic,
      confirmedAt,
      currentUserId: actorUserId,
      decisionId,
      job,
      jobId,
      jobStatus,
      note,
      pendingRecords,
      ...(requestedByUserId ? { requestedByUserId } : {}),
      targetStatus,
      ...(writeGuard ? { writeGuard } : {}),
    }),
  );

  if (
    writeGuard &&
    !(await importJobMatchesWriteGuard(env, { ...writeGuard, status: jobStatus }))
  ) {
    throw new Error("Import job changed while confirming pending records.");
  }

  return {
    confirmedCount: pendingRecords.length,
    records: updatedRecords,
    status: jobStatus,
  };
}

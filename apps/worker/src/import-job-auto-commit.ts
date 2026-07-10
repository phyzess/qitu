import type { WorkerImportAdapter } from "./import-adapters";
import { readImportJobReview } from "./import-review-job-read";
import {
  claimImportReviewMutation,
  releaseImportReviewMutation,
} from "./import-review-mutation-claim";
import { commitApprovedRecords } from "./import-review-commit-records";
import { writeConfirmPendingReviewRecords } from "./import-review-confirm-pending-records";
import { readOpenErrorReviewIssues } from "./import-review-issue-queries";
import type { ImportJobWriteGuard } from "./import-job-write-guard";

export async function autoCommitCleanImport(
  env: Env,
  input: {
    adapter: WorkerImportAdapter;
    importJobId: string;
    processingStartedAt?: string;
  },
): Promise<boolean> {
  if (!isAutoCommitEnabled(input.adapter)) return false;

  const initialJob = await readImportJobReview(env, input.importJobId);
  if (!initialJob) {
    throw new Error(`Import job was not found after staging: ${input.importJobId}.`);
  }
  if (
    initialJob.status !== "needs_review" &&
    initialJob.status !== "approved" &&
    initialJob.status !== "committing"
  ) {
    return false;
  }

  const processingStartedAt = input.processingStartedAt ?? initialJob.processing_started_at;
  const claim = await claimImportReviewMutation(env, {
    enterCommitting: true,
    expectedStatus: initialJob.status,
    importJobId: input.importJobId,
    kind: "auto_commit",
    processingStartedAt,
  });
  if (!claim) return false;

  const committingGuard: ImportJobWriteGuard = {
    importJobId: input.importJobId,
    mutationToken: claim.token,
    processingStartedAt,
    status: "committing",
  };
  let approvedStatePersisted = claim.previousStatus === "approved";
  let released = false;
  try {
    const job = await readImportJobReview(env, input.importJobId);
    if (!job || job.mutation_token !== claim.token || job.status !== "committing") {
      throw new Error("Automatic commit lost its mutation claim before reading review state.");
    }

    const openErrors = await readOpenErrorReviewIssues(env, { jobId: input.importJobId });
    if (openErrors.length > 0) {
      await releaseImportReviewMutation(env, {
        claim,
        importJobId: input.importJobId,
      });
      released = true;
      return false;
    }

    const pendingRecords = await input.adapter.reviewStore.readPendingStagedRecords(
      env,
      input.importJobId,
    );
    if (pendingRecords.length > 0) {
      await writeConfirmPendingReviewRecords({
        actorKind: "system",
        actorUserId: "system:auto-commit",
        adapter: input.adapter,
        automatic: true,
        env,
        job,
        jobId: input.importJobId,
        jobStatusOverride: "committing",
        note: "Automatically confirmed by the adapter commit policy.",
        pendingRecords,
        requestedByUserId: job.created_by,
        writeGuard: committingGuard,
      });
      approvedStatePersisted = true;
    }

    const [approvedRecords, currentOpenErrors] = await Promise.all([
      input.adapter.reviewStore.readApprovedStagedRecords(env, input.importJobId),
      readOpenErrorReviewIssues(env, { jobId: input.importJobId }),
    ]);
    if (currentOpenErrors.length > 0 || approvedRecords.length === 0) {
      await releaseImportReviewMutation(env, {
        claim,
        importJobId: input.importJobId,
        ...(approvedStatePersisted ? { status: "approved" } : {}),
      });
      released = true;
      return false;
    }
    approvedStatePersisted = true;

    const commit = await commitApprovedRecords({
      actorKind: "system",
      actorUserId: "system:auto-commit",
      adapter: input.adapter,
      approvedRecords,
      automatic: true,
      env,
      job: {
        ...job,
        status: "committing",
      },
      jobId: input.importJobId,
      requestedByUserId: job.created_by,
      writeGuard: committingGuard,
    });

    if (!commit.ok) {
      throw new Error(commit.error.message);
    }

    return true;
  } catch (error) {
    if (!released) {
      await releaseImportReviewMutation(env, {
        claim,
        importJobId: input.importJobId,
        ...(approvedStatePersisted ? { status: "approved" } : {}),
      });
    }
    throw error;
  }
}

export function isAutoCommitEnabled(adapter: WorkerImportAdapter): boolean {
  return (
    adapter.commitPolicy === "auto_when_clean" ||
    (adapter.commitPolicy === undefined && adapter.autoCommitCleanImports === true)
  );
}

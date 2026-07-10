import { authError, type AppContext } from "./http-utils";
import { commitApprovedRecords } from "./import-review-commit-records";
import { readImportReviewCommitTarget } from "./import-review-commit-target";
import { readImportJobReview } from "./import-review-job-read";
import { readOpenErrorReviewIssues } from "./import-review-issue-queries";
import {
  claimImportReviewMutation,
  releaseImportReviewMutation,
} from "./import-review-mutation-claim";
import { publicCommittedRecord } from "./import-review-presenters";

export async function commitApprovedReviewRecordsResponse(context: AppContext): Promise<Response> {
  const target = await readImportReviewCommitTarget(context);
  if (!target.ok) return target.response;
  const { adapter, current, job, jobId } = target;

  const initialApprovedRecords = await adapter.reviewStore.readApprovedStagedRecords(
    context.env,
    jobId,
  );
  if (initialApprovedRecords.length === 0) {
    const committedRecords = await adapter.reviewStore.readCommittedRecords(context.env, jobId);
    if (committedRecords.length > 0) {
      return context.json({
        importJobId: jobId,
        status: job.status,
        duplicate: true,
        committedRecords: committedRecords.map(publicCommittedRecord),
      });
    }

    return authError(
      context,
      "no_approved_records",
      "No approved staged records are available to commit.",
      409,
    );
  }

  const claim = await claimImportReviewMutation(context.env, {
    enterCommitting: true,
    expectedStatus: job.status,
    importJobId: jobId,
    kind: "commit",
    processingStartedAt: job.processing_started_at,
  });
  if (!claim) {
    return authError(
      context,
      "import_review_mutation_in_progress",
      "Another review change or commit is in progress; reload and retry.",
      409,
    );
  }

  let completed = false;
  try {
    const [claimedJob, approvedRecords] = await Promise.all([
      readImportJobReview(context.env, jobId),
      adapter.reviewStore.readApprovedStagedRecords(context.env, jobId),
    ]);
    if (
      !claimedJob ||
      claimedJob.status !== "committing" ||
      claimedJob.mutation_token !== claim.token ||
      approvedRecords.length === 0
    ) {
      return authError(
        context,
        "review_state_changed",
        "Review state changed while reserving the commit; reload and retry.",
        409,
      );
    }

    const openErrors = await readOpenErrorReviewIssues(context.env, {
      jobId,
      stagedRecordKeys: approvedRecords.map((record) => record.staged_record_key),
    });
    if (openErrors.length > 0) {
      return authError(
        context,
        "open_review_errors",
        "Approved records with open validation errors must be explicitly accepted before commit.",
        409,
      );
    }

    const commitResult = await commitApprovedRecords({
      actorUserId: current.user.id,
      adapter,
      approvedRecords,
      env: context.env,
      job: claimedJob,
      jobId,
      writeGuard: {
        importJobId: jobId,
        mutationToken: claim.token,
        processingStartedAt: claimedJob.processing_started_at,
        status: "committing",
      },
    });
    if (!commitResult.ok) {
      return authError(
        context,
        commitResult.error.code,
        commitResult.error.message,
        commitResult.error.status,
      );
    }
    completed = true;

    return context.json({
      importJobId: jobId,
      status: commitResult.status,
      committedRecords: commitResult.committedRecords.map(publicCommittedRecord),
    });
  } finally {
    if (!completed) {
      await releaseImportReviewMutation(context.env, {
        claim,
        importJobId: jobId,
      });
    }
  }
}

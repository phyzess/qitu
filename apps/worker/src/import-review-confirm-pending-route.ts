import { authError, parseRequestJson, type AppContext } from "./http-utils";
import { writeConfirmPendingReviewRecords } from "./import-review-confirm-pending-records";
import {
  readConfirmPendingReviewer,
  readConfirmPendingTarget,
} from "./import-review-confirm-pending-target";
import { ReviewDecisionInputSchema } from "./import-review-decision-input";
import { readOpenErrorReviewIssues } from "./import-review-issue-queries";
import { publicStagedRecord } from "./import-review-presenters";
import {
  claimImportReviewMutation,
  releaseImportReviewMutation,
} from "./import-review-mutation-claim";

export async function confirmPendingReviewRecordsResponse(context: AppContext): Promise<Response> {
  const reviewer = await readConfirmPendingReviewer(context);
  if (!reviewer.ok) return reviewer.response;

  const input = await parseRequestJson(context, ReviewDecisionInputSchema);
  if (!input.ok) return input.response;

  const initialTarget = await readConfirmPendingTarget(context);
  if (!initialTarget.ok) return initialTarget.response;
  const claim = await claimImportReviewMutation(context.env, {
    expectedStatus: initialTarget.job.status,
    importJobId: initialTarget.jobId,
    kind: "confirm_pending",
    processingStartedAt: initialTarget.job.processing_started_at,
  });
  if (!claim) {
    return authError(
      context,
      "import_review_mutation_in_progress",
      "Another review change is in progress; reload and retry.",
      409,
    );
  }

  let currentStatus = claim.status;
  try {
    const target = await readConfirmPendingTarget(context);
    if (!target.ok) return target.response;
    const { adapter, job, jobId, pendingRecords } = target;

    const openErrors = await readOpenErrorReviewIssues(context.env, {
      jobId,
      stagedRecordKeys: pendingRecords.map((record) => record.staged_record_key),
    });
    if (openErrors.length > 0) {
      return authError(
        context,
        "open_review_errors",
        "Pending records with open validation errors cannot be batch confirmed.",
        409,
      );
    }

    if (pendingRecords.length === 0) {
      return context.json({
        importJobId: jobId,
        status: job.status,
        confirmedCount: 0,
        records: [],
        duplicate: true,
      });
    }

    const confirmation = await writeConfirmPendingReviewRecords({
      actorUserId: reviewer.current.user.id,
      adapter,
      env: context.env,
      job,
      jobId,
      note: input.value.note ?? null,
      pendingRecords,
      writeGuard: {
        importJobId: jobId,
        mutationToken: claim.token,
        processingStartedAt: job.processing_started_at,
        status: job.status,
      },
    });
    currentStatus = confirmation.status;

    return context.json({
      importJobId: jobId,
      status: confirmation.status,
      confirmedCount: confirmation.confirmedCount,
      records: confirmation.records.map(publicStagedRecord),
    });
  } finally {
    await releaseImportReviewMutation(context.env, {
      claim,
      currentStatus,
      importJobId: initialTarget.jobId,
      status: currentStatus,
    });
  }
}

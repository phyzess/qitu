import {
  stagedStatusForReviewAction,
  type ReviewRecordDecisionAction,
} from "@qitu/import-pipeline";
import { authError, parseRequestJson, type AppContext } from "./http-utils";
import { ReviewDecisionInputSchema } from "./import-review-decision-input";
import { writeReviewRecordDecision } from "./import-review-decision-record";
import { readReviewDecisionTarget } from "./import-review-decision-target";
import { readOpenErrorReviewIssues } from "./import-review-issue-queries";
import {
  claimImportReviewMutation,
  releaseImportReviewMutation,
} from "./import-review-mutation-claim";
import { publicStagedRecord } from "./import-review-presenters";

export async function recordReviewDecisionResponse(
  context: AppContext,
  action: ReviewRecordDecisionAction,
): Promise<Response> {
  const input = await parseRequestJson(context, ReviewDecisionInputSchema);
  if (!input.ok) return input.response;

  const initialTarget = await readReviewDecisionTarget(context);
  if (!initialTarget.ok) return initialTarget.response;
  const claim = await claimImportReviewMutation(context.env, {
    expectedStatus: initialTarget.job.status,
    importJobId: initialTarget.jobId,
    kind: "record_decision",
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
    const target = await readReviewDecisionTarget(context);
    if (!target.ok) return target.response;
    const { adapter, current, job, jobId, record } = target;

    const targetStatus = stagedStatusForReviewAction(action);
    const openErrors =
      action === "approve"
        ? await readOpenErrorReviewIssues(context.env, {
            jobId,
            stagedRecordKeys: [record.staged_record_key],
          })
        : [];
    if (openErrors.length > 0 && input.value.overrideOpenErrors !== true) {
      return context.json(
        {
          error: {
            code: "open_review_errors",
            message: "Open validation errors must be explicitly accepted before approval.",
            issues: openErrors.map((issue) => ({
              code: issue.code,
              id: issue.id,
              stagedRecordKey: issue.staged_record_key,
            })),
          },
        },
        409,
      );
    }

    if (record.review_status === targetStatus && openErrors.length === 0) {
      return context.json({
        record: publicStagedRecord(record),
        duplicate: true,
      });
    }

    const decision = await writeReviewRecordDecision({
      acceptedOpenErrors: input.value.overrideOpenErrors === true ? openErrors : [],
      action,
      adapter,
      context,
      current,
      jobId,
      note: input.value.note ?? null,
      record,
      targetStatus,
      writeGuard: {
        importJobId: jobId,
        mutationToken: claim.token,
        processingStartedAt: job.processing_started_at,
        status: job.status,
      },
    });
    currentStatus = decision.status;

    return context.json({
      record: publicStagedRecord(decision.record),
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

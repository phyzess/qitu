import { requestFingerprint } from "./event-store";
import { authError, type AppContext } from "./http-utils";
import { dispatchImportJobRetry } from "./import-job-retry-dispatch";
import { prepareImportJobRetryStatements } from "./import-job-retry-record";
import { readImportJobRetryTarget } from "./import-job-retry-target";
import {
  claimImportReviewMutation,
  releaseImportReviewMutation,
} from "./import-review-mutation-claim";

export async function retryImportJobResponse(context: AppContext): Promise<Response> {
  const target = await readImportJobRetryTarget(context);
  if (!target.ok) return target.response;
  const { current, job, jobId } = target;
  const claim = await claimImportReviewMutation(context.env, {
    expectedStatus: "failed",
    importJobId: jobId,
    kind: "retry",
    processingStartedAt: job.processing_started_at,
  });
  if (!claim) {
    return authError(
      context,
      "import_job_state_changed",
      "Import job state or source lifecycle changed; reload and retry.",
      409,
    );
  }

  let currentStatus = "failed";
  try {
    const now = new Date().toISOString();
    const fingerprint = await requestFingerprint(context);
    await context.env.DB.batch(
      prepareImportJobRetryStatements(context.env, {
        actorUserId: current.user.id,
        job,
        jobId,
        now,
        requestId: fingerprint.requestId,
        writeGuard: {
          importJobId: jobId,
          mutationToken: claim.token,
          processingStartedAt: job.processing_started_at,
          status: "failed",
        },
      }),
    );
    currentStatus = "queued";

    const dispatchFailure = await dispatchImportJobRetry(context, { current, job, jobId });
    if (dispatchFailure) {
      currentStatus = "failed";
      return dispatchFailure;
    }

    return context.json({
      importJobId: jobId,
      status: "queued",
    });
  } finally {
    await releaseImportReviewMutation(context.env, {
      claim,
      currentStatus,
      importJobId: jobId,
      status: currentStatus,
    });
  }
}

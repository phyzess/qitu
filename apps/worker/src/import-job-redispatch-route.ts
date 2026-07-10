import type { ImportJobMessage } from "@qitu/jobs";
import type { Hono } from "hono";
import { requestFingerprint } from "./event-store";
import { scheduleFastImportProcessing } from "./import-job-fast-path";
import {
  prepareImportJobRedispatchFailedStatements,
  prepareImportJobRedispatchSucceededStatements,
} from "./import-job-redispatch-record";
import { readImportJobRedispatchTarget } from "./import-job-redispatch-target";
import {
  claimImportReviewMutation,
  releaseImportReviewMutation,
} from "./import-review-mutation-claim";
import { authError } from "./http-utils";

export function registerImportJobRedispatchRoute(app: Hono<{ Bindings: Env }>): void {
  app.post("/api/import-jobs/:jobId/dispatch", async (context) => {
    const target = await readImportJobRedispatchTarget(context);
    if (!target.ok) return target.response;
    const { current, job } = target;
    const claim = await claimImportReviewMutation(context.env, {
      expectedStatus: "queued",
      importJobId: job.id,
      kind: "redispatch",
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
    const message: ImportJobMessage = {
      jobId: job.id,
      kind: "import.source_file",
      objectKey: job.object_key,
      requestedBy: current.user.id,
      sourceFileId: job.source_file_id,
    };
    const now = new Date().toISOString();
    const fingerprint = await requestFingerprint(context);

    let released = false;
    try {
      try {
        await context.env.IMPORT_JOBS.send(message);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Queue dispatch failed.";
        await context.env.DB.batch(
          prepareImportJobRedispatchFailedStatements(context.env, {
            actorUserId: current.user.id,
            job,
            now,
            reason,
            requestId: fingerprint.requestId,
            writeGuard: {
              importJobId: job.id,
              mutationToken: claim.token,
              processingStartedAt: job.processing_started_at,
              status: "queued",
            },
          }),
        );

        return context.json(
          {
            error: {
              code: "queue_dispatch_failed",
              message: "Import job dispatch retry failed.",
            },
          },
          503,
        );
      }

      await context.env.DB.batch(
        prepareImportJobRedispatchSucceededStatements(context.env, {
          actorUserId: current.user.id,
          job,
          now,
          requestId: fingerprint.requestId,
          writeGuard: {
            importJobId: job.id,
            mutationToken: claim.token,
            processingStartedAt: job.processing_started_at,
            status: "queued",
          },
        }),
      );
      await releaseImportReviewMutation(context.env, {
        claim,
        importJobId: job.id,
      });
      released = true;
      scheduleFastImportProcessing(context, message);

      return context.json({
        importJobId: job.id,
        status: "queued",
      });
    } finally {
      if (!released) {
        await releaseImportReviewMutation(context.env, {
          claim,
          importJobId: job.id,
        });
      }
    }
  });
}

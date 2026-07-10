import type { ImportJobMessage } from "@qitu/jobs";
import { getImportAdapter } from "./import-adapters";
import { autoCommitCleanImport, isAutoCommitEnabled } from "./import-job-auto-commit";
import { markImportJobFailed } from "./import-job-failure";
import { reclaimStaleImportDispatchMutation } from "./import-job-dispatch-claim-recovery";
import { readImportProcessingJob, type ImportProcessingJobRow } from "./import-job-processing-read";
import {
  importReviewMutationRetryDelaySeconds,
  isImportReviewMutationStale,
} from "./import-review-mutation-claim";
import { releaseImportJobProcessingLease } from "./import-job-processing-release";
import {
  importJobProcessingRetryDelaySeconds,
  markImportJobProcessingStarted,
} from "./import-job-processing-start";
import { stageImportJobRecords } from "./import-job-staging";
import {
  isSourceDeletionRecoveryDue,
  sourceDeletionRetryDelaySeconds,
} from "./source-deletion-lease";
import { recoverClaimedSourceDeletion } from "./source-deletion-recovery";

type ProcessImportJobMode = "fast" | "queue";

export type ProcessImportJobResult = {
  outcome: "completed" | "failed" | "ignored" | "released" | "retry";
  retryDelaySeconds?: number;
};

export async function processImportJob(
  env: Env,
  body: ImportJobMessage,
  options: { mode?: ProcessImportJobMode } = {},
): Promise<ProcessImportJobResult> {
  const mode = options.mode ?? "queue";
  let job = await readImportProcessingJob(env, body.jobId);
  if (!job || job.deleted_at) {
    return { outcome: "ignored" };
  }
  if (job.deletion_started_at) {
    if (mode === "fast") return { outcome: "ignored" };
    if (!isSourceDeletionRecoveryDue(job.deletion_started_at, job.deletion_failure_stage)) {
      return {
        outcome: "retry",
        retryDelaySeconds: sourceDeletionRetryDelaySeconds(
          job.deletion_started_at,
          job.deletion_failure_stage,
        ),
      };
    }

    try {
      await recoverClaimedSourceDeletion(env, {
        actorUserId: job.deletion_started_by,
        sourceFileId: job.source_file_id,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          error: error instanceof Error ? error.message : "unknown error",
          message: "Queue-assisted source deletion recovery failed.",
          sourceFileId: job.source_file_id,
        }),
      );
      return { outcome: "ignored" };
    }

    job = await readImportProcessingJob(env, body.jobId);
    if (!job || job.deleted_at || job.deletion_started_at) {
      return { outcome: "ignored" };
    }
  }

  if (job.status === "queued" && job.mutation_token) {
    if (mode === "fast") return { outcome: "ignored" };
    if (
      (job.mutation_kind === "retry" || job.mutation_kind === "redispatch") &&
      isImportReviewMutationStale(job.mutation_started_at, job.mutation_kind) &&
      (await reclaimStaleImportDispatchMutation(env, job))
    ) {
      job = await readImportProcessingJob(env, body.jobId);
      if (!job) return { outcome: "ignored" };
    } else {
      return {
        outcome: "retry",
        retryDelaySeconds: importReviewMutationRetryDelaySeconds(
          job.mutation_started_at,
          job.mutation_kind,
        ),
      };
    }
  }

  if (isAutoCommitResumeStatus(job.status)) {
    return resumeAutomaticCommit(env, job, mode);
  }

  if (job.status === "processing") {
    if (mode === "fast") return { outcome: "ignored" };

    const retryDelaySeconds = importJobProcessingRetryDelaySeconds(job.processing_lease_expires_at);
    if (retryDelaySeconds > 0) {
      return { outcome: "retry", retryDelaySeconds };
    }
  } else if (job.status !== "queued") {
    return { outcome: "ignored" };
  }

  const adapter = getImportAdapter(job.adapter_id);
  if (!adapter) {
    if (mode === "fast") return { outcome: "ignored" };

    const failed = await markImportJobFailed(env, {
      jobId: body.jobId,
      sourceFileId: body.sourceFileId,
      reason: `Import adapter is not registered: ${job.adapter_id ?? "none"}.`,
      action: "import_job.adapter_missing",
      failureClass: "adapter_missing",
      expectedStatus: job.status,
      ...(job.processing_started_at ? { processingStartedAt: job.processing_started_at } : {}),
      ...(job.processing_owner ? { processingOwner: job.processing_owner } : {}),
    });
    return { outcome: failed ? "failed" : "ignored" };
  }

  const startedAt = new Date().toISOString();
  const claim = await markImportJobProcessingStarted(env, {
    adapterId: adapter.id,
    jobId: body.jobId,
    objectKey: job.object_key,
    previousProcessingStartedAt: job.processing_started_at,
    sourceFileId: job.source_file_id,
    startedAt,
    statusFrom: job.status as "processing" | "queued",
    mode,
  });
  if (!claim.claimed) {
    job = await readImportProcessingJob(env, body.jobId);
    return retryResultForCurrentJobState(job, mode);
  }

  try {
    const sourceObject = await env.SOURCE_FILES.get(job.object_key);
    if (!sourceObject) {
      return finishAttemptFailure(env, {
        action: "import_job.source_missing",
        failureClass: "source_missing",
        importJobId: body.jobId,
        mode,
        processingOwner: claim.processingOwner,
        processingStartedAt: claim.processingStartedAt,
        reason: "Source object was not found in R2.",
        sourceFileId: job.source_file_id,
      });
    }

    const stagedRecords = await adapter.parseAndStage(sourceObject.body);
    if (stagedRecords.length === 0) {
      return finishAttemptFailure(env, {
        action: "import_job.no_records",
        failureClass: "validation",
        importJobId: body.jobId,
        mode,
        processingOwner: claim.processingOwner,
        processingStartedAt: claim.processingStartedAt,
        reason: "Import adapter did not produce any staged records.",
        sourceFileId: job.source_file_id,
      });
    }

    const staged = await stageImportJobRecords(env, {
      adapter,
      importJobId: body.jobId,
      objectKey: job.object_key,
      processingStartedAt: claim.processingStartedAt,
      processingOwner: claim.processingOwner,
      sourceFileId: job.source_file_id,
      stagedAt: new Date().toISOString(),
      stagedRecords,
    });

    if (staged) return { outcome: "completed" };
    return retryResultForCurrentJobState(await readImportProcessingJob(env, body.jobId), mode);
  } catch (error) {
    return finishAttemptFailure(env, {
      action: "import_job.failed",
      failureClass: "processing",
      importJobId: body.jobId,
      mode,
      processingOwner: claim.processingOwner,
      processingStartedAt: claim.processingStartedAt,
      reason: error instanceof Error ? error.message : "Import job processing failed.",
      sourceFileId: job.source_file_id,
    });
  }
}

function retryResultForCurrentJobState(
  job: ImportProcessingJobRow | null,
  mode: ProcessImportJobMode,
): ProcessImportJobResult {
  if (job?.deleted_at) return { outcome: "ignored" };
  if (mode === "queue" && job?.deletion_started_at) {
    return {
      outcome: "retry",
      retryDelaySeconds: sourceDeletionRetryDelaySeconds(
        job.deletion_started_at,
        job.deletion_failure_stage,
      ),
    };
  }
  if (!job || mode === "fast") return { outcome: "ignored" };
  if (job.status === "queued") {
    if (job.mutation_token) {
      return {
        outcome: "retry",
        retryDelaySeconds: importReviewMutationRetryDelaySeconds(
          job.mutation_started_at,
          job.mutation_kind,
        ),
      };
    }
    return { outcome: "retry", retryDelaySeconds: 1 };
  }
  if (job.status === "processing") {
    const retryDelaySeconds = importJobProcessingRetryDelaySeconds(job.processing_lease_expires_at);
    return retryDelaySeconds > 0
      ? { outcome: "retry", retryDelaySeconds }
      : { outcome: "retry", retryDelaySeconds: 1 };
  }
  if (job.status === "committing") {
    return {
      outcome: "retry",
      retryDelaySeconds: importReviewMutationRetryDelaySeconds(
        job.mutation_started_at,
        job.mutation_kind,
      ),
    };
  }
  if (job.status === "needs_review" || job.status === "approved") {
    return { outcome: "retry", retryDelaySeconds: 2 };
  }
  return { outcome: "ignored" };
}

async function finishAttemptFailure(
  env: Env,
  input: {
    action: string;
    failureClass: "processing" | "source_missing" | "validation";
    importJobId: string;
    mode: ProcessImportJobMode;
    processingOwner: string;
    processingStartedAt: string;
    reason: string;
    sourceFileId: string;
  },
): Promise<ProcessImportJobResult> {
  if (input.mode === "fast") {
    const released = await releaseImportJobProcessingLease(env, input);
    return { outcome: released ? "released" : "ignored" };
  }

  const failed = await markImportJobFailed(env, {
    jobId: input.importJobId,
    sourceFileId: input.sourceFileId,
    reason: input.reason,
    action: input.action,
    failureClass: input.failureClass,
    expectedStatus: "processing",
    processingStartedAt: input.processingStartedAt,
    processingOwner: input.processingOwner,
  });
  if (failed) return { outcome: "failed" };

  const current = await readImportProcessingJob(env, input.importJobId);
  const currentStateResult = retryResultForCurrentJobState(current, input.mode);
  if (currentStateResult.outcome === "retry") return currentStateResult;
  if (
    current?.processing_started_at === input.processingStartedAt &&
    isAutoCommitResumeStatus(current.status) &&
    !current.deletion_started_at &&
    !current.deleted_at
  ) {
    return { outcome: "retry", retryDelaySeconds: 2 };
  }

  return { outcome: "ignored" };
}

async function resumeAutomaticCommit(
  env: Env,
  job: ImportProcessingJobRow,
  mode: ProcessImportJobMode,
): Promise<ProcessImportJobResult> {
  const adapter = getImportAdapter(job.adapter_id);
  if (!adapter || !isAutoCommitEnabled(adapter) || !job.processing_started_at) {
    return { outcome: "ignored" };
  }

  try {
    const committed = await autoCommitCleanImport(env, {
      adapter,
      importJobId: job.id,
      processingStartedAt: job.processing_started_at,
    });
    if (committed) return { outcome: "completed" };

    const current = await readImportProcessingJob(env, job.id);
    if (mode === "queue" && current?.status === "committing") {
      return {
        outcome: "retry",
        retryDelaySeconds: importReviewMutationRetryDelaySeconds(
          current.mutation_started_at,
          current.mutation_kind,
        ),
      };
    }
    return { outcome: "ignored" };
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : "unknown error",
        importJobId: job.id,
        message: "Automatic import commit can be retried from its persisted review state.",
      }),
    );
    return mode === "queue" ? { outcome: "retry", retryDelaySeconds: 2 } : { outcome: "ignored" };
  }
}

function isAutoCommitResumeStatus(status: string): boolean {
  return status === "needs_review" || status === "approved" || status === "committing";
}

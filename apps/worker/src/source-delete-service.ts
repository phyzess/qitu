import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import { getImportAdapter } from "./import-adapters";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import { readImportJobReview } from "./import-review-job-read";
import { voidImportJob } from "./import-job-void-statements";
import type { WorkerReviewStore } from "./import-review-store";
import {
  readSourceImportJobs,
  readSourceLifecycleRow,
  type SourceLifecycleRow,
} from "./source-lifecycle-query";
import {
  IMPORT_DISPATCH_MUTATION_LEASE_MS,
  IMPORT_REVIEW_MUTATION_LEASE_MS,
  isImportReviewMutationStale,
} from "./import-review-mutation-claim";
import { SOURCE_DELETION_LEASE_MS } from "./source-deletion-lease";

export type DeleteSourceResult = {
  sourceFileId: string;
  status:
    | "deleted"
    | "already_deleted"
    | "not_found"
    | "cleanup_not_supported"
    | "deletion_in_progress"
    | "mutation_in_progress"
    | "delete_failed";
  retention: "report_only";
  voidedImportJobIds?: string[];
  adapterIdsWithoutCleanup?: string[];
  failureStage?: "void_jobs" | "r2_delete" | "d1_cleanup";
  message?: string;
};

export async function deleteSourceFile(
  env: Env,
  input: { actorUserId: string; sourceFileId: string },
): Promise<DeleteSourceResult> {
  const source = await readSourceLifecycleRow(env, input.sourceFileId);
  if (!source) {
    return {
      sourceFileId: input.sourceFileId,
      status: "not_found",
      retention: "report_only",
    };
  }

  if (source.deleted_at) {
    return {
      sourceFileId: input.sourceFileId,
      status: "already_deleted",
      retention: "report_only",
    };
  }

  const jobsBeforeClaim = await readSourceImportJobs(env, input.sourceFileId);
  const mutationStaleBefore = new Date(Date.now() - IMPORT_REVIEW_MUTATION_LEASE_MS).toISOString();
  const dispatchMutationStaleBefore = new Date(
    Date.now() - IMPORT_DISPATCH_MUTATION_LEASE_MS,
  ).toISOString();
  if (
    jobsBeforeClaim.some(
      (job) =>
        job.status === "committing" ||
        (job.mutation_token &&
          !isImportReviewMutationStale(job.mutation_started_at, job.mutation_kind)),
    )
  ) {
    return {
      sourceFileId: source.id,
      status: "mutation_in_progress",
      retention: "report_only",
      message: "An import job mutation must finish or recover before its source can be deleted.",
    };
  }

  const staleBefore = new Date(Date.now() - SOURCE_DELETION_LEASE_MS).toISOString();
  const claimMode = sourceDeletionClaimMode(source, staleBefore);
  if (!claimMode) {
    return {
      sourceFileId: source.id,
      status: "deletion_in_progress",
      retention: "report_only",
    };
  }

  let deletionStartedAt = nextSourceDeletionLeaseToken(source.deletion_started_at);
  const claimStatement = env.DB.prepare(
    `
      UPDATE source_files
      SET
        deletion_started_at = ?,
        deletion_started_by = ?,
        deletion_failure_stage = NULL,
        deletion_failure_reason = NULL
      WHERE id = ?
        AND deleted_at IS NULL
        AND deletion_started_at IS ?
        AND deletion_failure_stage IS ?
        AND NOT EXISTS (
          SELECT 1
          FROM import_jobs
          WHERE import_jobs.source_file_id = source_files.id
            AND import_jobs.mutation_token IS NOT NULL
            AND (
              import_jobs.status = 'committing'
              OR import_jobs.mutation_started_at IS NULL
              OR (
                import_jobs.mutation_kind IN ('retry', 'redispatch')
                AND import_jobs.mutation_started_at > ?
              )
              OR (
                (
                  import_jobs.mutation_kind IS NULL
                  OR import_jobs.mutation_kind NOT IN ('retry', 'redispatch')
                )
                AND import_jobs.mutation_started_at > ?
              )
            )
        )
    `,
  ).bind(
    deletionStartedAt,
    input.actorUserId,
    source.id,
    source.deletion_started_at,
    source.deletion_failure_stage,
    dispatchMutationStaleBefore,
    mutationStaleBefore,
  );
  try {
    await env.DB.batch([
      claimStatement,
      prepareSourceDeletionClaimChangeAssertion(env, source.id, deletionStartedAt),
      ...(claimMode === "new"
        ? []
        : [
            prepareSourceDeletionClaimTransitionAudit(env, {
              actorUserId: input.actorUserId,
              deletionStartedAt,
              mode: claimMode,
              previousDeletionFailureStage: source.deletion_failure_stage,
              previousDeletionStartedAt: source.deletion_started_at,
              sourceFileId: source.id,
              staleBefore,
            }),
          ]),
    ]);
  } catch (error) {
    const current = await readSourceLifecycleRow(env, source.id);
    const currentJobs = await readSourceImportJobs(env, source.id);
    if (
      currentJobs.some(
        (job) =>
          job.status === "committing" ||
          (job.mutation_token &&
            !isImportReviewMutationStale(job.mutation_started_at, job.mutation_kind)),
      )
    ) {
      return {
        sourceFileId: source.id,
        status: "mutation_in_progress",
        retention: "report_only",
        message: "An import job mutation must finish or recover before its source can be deleted.",
      };
    }
    if (
      !current ||
      current.deleted_at ||
      current.deletion_started_at !== source.deletion_started_at ||
      current.deletion_failure_stage !== source.deletion_failure_stage
    ) {
      return {
        sourceFileId: source.id,
        status: current?.deleted_at ? "already_deleted" : "deletion_in_progress",
        retention: "report_only",
      };
    }
    throw error;
  }

  const jobs = await readSourceImportJobs(env, input.sourceFileId);
  const reviewStoreJobIds = new Map<WorkerReviewStore, string[]>();
  const adapterIdsWithoutCleanup = new Set<string>();
  for (const job of jobs) {
    const adapter = getImportAdapter(job.adapter_id);
    if (!adapter?.reviewStore.prepareDeleteSourceRecords) {
      adapterIdsWithoutCleanup.add(job.adapter_id ?? "unregistered");
      continue;
    }
    const importJobIds = reviewStoreJobIds.get(adapter.reviewStore) ?? [];
    importJobIds.push(job.id);
    reviewStoreJobIds.set(adapter.reviewStore, importJobIds);
  }

  if (adapterIdsWithoutCleanup.size > 0) {
    if (claimMode === "new") {
      await releaseDeletionClaim(env, source.id, deletionStartedAt);
    } else {
      await markSourceDeletionCleanupBlocked(env, {
        adapterIdsWithoutCleanup: [...adapterIdsWithoutCleanup],
        deletionStartedAt,
        sourceFileId: source.id,
      });
    }
    return {
      sourceFileId: input.sourceFileId,
      status: "cleanup_not_supported",
      retention: "report_only",
      adapterIdsWithoutCleanup: [...adapterIdsWithoutCleanup],
    };
  }

  const deletedAt = new Date().toISOString();
  const jobsToVoid = jobs.filter((job) => job.status !== "voided");
  try {
    for (const job of jobsToVoid) {
      const renewedDeletionStartedAt = await renewSourceDeletionClaim(env, {
        actorUserId: input.actorUserId,
        deletionStartedAt,
        sourceFileId: source.id,
      });
      if (!renewedDeletionStartedAt) {
        return sourceDeletionClaimLostResult(env, source.id);
      }
      deletionStartedAt = renewedDeletionStartedAt;
      const voided = await voidImportJob(env, {
        actorUserId: input.actorUserId,
        importJobId: job.id,
        reason: "source_deleted",
        sourceFileId: source.id,
        statusFrom: job.status,
        voidedAt: deletedAt,
      });
      if (!voided) {
        const currentJob = await readImportJobReview(env, job.id);
        if (currentJob?.status !== "voided") {
          throw new Error(`Import job changed while source deletion was voiding it: ${job.id}.`);
        }
      }
    }
  } catch (error) {
    return sourceDeleteFailureResult(
      env,
      {
        actorUserId: input.actorUserId,
        deletionStartedAt,
        jobs,
        source,
        stage: "void_jobs",
      },
      error,
    );
  }

  try {
    const renewedDeletionStartedAt = await renewSourceDeletionClaim(env, {
      actorUserId: input.actorUserId,
      deletionStartedAt,
      sourceFileId: source.id,
    });
    if (!renewedDeletionStartedAt) {
      return sourceDeletionClaimLostResult(env, source.id);
    }
    deletionStartedAt = renewedDeletionStartedAt;
    await env.SOURCE_FILES.delete(source.object_key);
  } catch (error) {
    return sourceDeleteFailureResult(
      env,
      {
        actorUserId: input.actorUserId,
        deletionStartedAt,
        jobs,
        source,
        stage: "r2_delete",
      },
      error,
    );
  }

  try {
    const renewedDeletionStartedAt = await renewSourceDeletionClaim(env, {
      actorUserId: input.actorUserId,
      deletionStartedAt,
      sourceFileId: source.id,
    });
    if (!renewedDeletionStartedAt) {
      return sourceDeletionClaimLostResult(env, source.id);
    }
    deletionStartedAt = renewedDeletionStartedAt;
  } catch (error) {
    return sourceDeleteFailureResult(
      env,
      {
        actorUserId: input.actorUserId,
        deletionStartedAt,
        jobs,
        source,
        stage: "d1_cleanup",
      },
      error,
    );
  }

  const importJobIds = jobs.map((job) => job.id);
  try {
    await env.DB.batch([
      prepareSourceDeletionClaimAssertion(env, source.id, deletionStartedAt),
      ...[...reviewStoreJobIds].flatMap(([store, storeImportJobIds]) =>
        store.prepareDeleteSourceRecords!(env, {
          importJobIds: storeImportJobIds,
          sourceFileId: source.id,
        }),
      ),
      env.DB.prepare(
        `
          UPDATE source_files
          SET
            deleted_at = ?,
            deleted_by = ?,
            deletion_started_at = NULL,
            deletion_started_by = NULL,
            deletion_failure_stage = NULL,
            deletion_failure_reason = NULL
          WHERE id = ?
            AND deleted_at IS NULL
            AND deletion_started_at = ?
        `,
      ).bind(deletedAt, input.actorUserId, source.id, deletionStartedAt),
      prepareResolveSourceDeletionAlert(env, source.id, deletedAt),
      ...jobs.map((job) =>
        prepareImportJobEventInsert(env, {
          importJobId: job.id,
          sourceFileId: source.id,
          eventType: "source_file.deleted",
          statusFrom: "voided",
          statusTo: "voided",
          actorUserId: input.actorUserId,
          message: "Source object deleted; metadata retained for reporting.",
          createdAt: deletedAt,
          metadata: {
            retention: "report_only",
          },
        }),
      ),
      prepareSourceDeletedAudit(env, source, input.actorUserId, deletedAt, importJobIds),
    ]);
  } catch (error) {
    return sourceDeleteFailureResult(
      env,
      {
        actorUserId: input.actorUserId,
        deletionStartedAt,
        jobs,
        source,
        stage: "d1_cleanup",
      },
      error,
    );
  }

  const deletedSource = await readSourceLifecycleRow(env, source.id);
  if (deletedSource?.deleted_at !== deletedAt) {
    return {
      sourceFileId: source.id,
      status: deletedSource?.deleted_at ? "already_deleted" : "deletion_in_progress",
      retention: "report_only",
    };
  }

  return {
    sourceFileId: source.id,
    status: "deleted",
    retention: "report_only",
    voidedImportJobIds: jobsToVoid.map((job) => job.id),
  };
}

async function releaseDeletionClaim(
  env: Env,
  sourceFileId: string,
  deletionStartedAt: string,
): Promise<void> {
  await env.DB.prepare(
    `
      UPDATE source_files
      SET deletion_started_at = NULL, deletion_started_by = NULL
      WHERE id = ? AND deletion_started_at = ? AND deleted_at IS NULL
    `,
  )
    .bind(sourceFileId, deletionStartedAt)
    .run();
}

async function sourceDeleteFailureResult(
  env: Env,
  input: {
    actorUserId: string;
    deletionStartedAt: string;
    jobs: Array<{ id: string }>;
    source: SourceLifecycleRow;
    stage: "void_jobs" | "r2_delete" | "d1_cleanup";
  },
  error: unknown,
): Promise<DeleteSourceResult> {
  const failedAt = new Date().toISOString();
  const failureReason =
    error instanceof Error ? error.message.slice(0, 500) : "Source deletion failed.";

  let evidenceRecorded = false;
  let evidenceWriteError: unknown = null;
  try {
    await env.DB.batch([
      prepareSourceDeletionClaimAssertion(env, input.source.id, input.deletionStartedAt),
      env.DB.prepare(
        `
          UPDATE source_files
          SET
            deletion_failure_stage = ?,
            deletion_failure_reason = ?
          WHERE id = ? AND deletion_started_at = ? AND deleted_at IS NULL
        `,
      ).bind(input.stage, failureReason, input.source.id, input.deletionStartedAt),
      ...input.jobs.map((job) =>
        prepareImportJobEventInsert(env, {
          importJobId: job.id,
          sourceFileId: input.source.id,
          eventType: "source_file.delete_failed",
          actorUserId: input.actorUserId,
          message: "Source deletion failed and can be retried.",
          createdAt: failedAt,
          metadata: {
            stage: input.stage,
          },
        }),
      ),
      prepareAuditInsert(
        env,
        createAuditEvent({
          action: "source_file.delete_failed",
          actor: {
            id: input.actorUserId,
            kind: "user",
          },
          subject: {
            id: input.source.id,
            kind: "source_file",
          },
          metadata: {
            stage: input.stage,
            retryable: true,
          },
        }),
      ),
      prepareSourceDeletionStalledAlert(env, {
        failedAt,
        failureReason,
        sourceFileId: input.source.id,
        stage: input.stage,
      }),
    ]);
    evidenceRecorded = true;
  } catch (evidenceError) {
    evidenceWriteError = evidenceError;
  }

  if (!evidenceRecorded) {
    const current = await readSourceLifecycleRow(env, input.source.id);
    if (current?.deleted_at) {
      return {
        sourceFileId: input.source.id,
        status: "already_deleted",
        retention: "report_only",
      };
    }
    if (current?.deletion_started_at && current.deletion_started_at !== input.deletionStartedAt) {
      return {
        sourceFileId: input.source.id,
        status: "deletion_in_progress",
        retention: "report_only",
      };
    }
  }

  if (evidenceWriteError) {
    console.error(
      JSON.stringify({
        error: evidenceWriteError instanceof Error ? evidenceWriteError.message : "unknown error",
        message: "Failed to persist source deletion failure evidence.",
        sourceFileId: input.source.id,
        stage: input.stage,
      }),
    );
  }

  console.error(
    JSON.stringify({
      error: failureReason,
      message: "Source deletion failed.",
      sourceFileId: input.source.id,
      stage: input.stage,
    }),
  );

  return {
    sourceFileId: input.source.id,
    status: "delete_failed",
    retention: "report_only",
    failureStage: input.stage,
    message: `Source deletion failed during ${input.stage} and can be retried.`,
  };
}

type SourceDeletionClaimMode = "new" | "reclaimed" | "resumed";

function sourceDeletionClaimMode(
  source: SourceLifecycleRow,
  staleBefore: string,
): SourceDeletionClaimMode | null {
  if (source.deletion_failure_stage) return "resumed";
  if (!source.deletion_started_at) return "new";
  return source.deletion_started_at <= staleBefore ? "reclaimed" : null;
}

function nextSourceDeletionLeaseToken(previousToken: string | null): string {
  const previousTime = previousToken ? Date.parse(previousToken) : Number.NaN;
  const nextTime = Number.isFinite(previousTime)
    ? Math.max(Date.now(), previousTime + 1)
    : Date.now();
  return new Date(nextTime).toISOString();
}

async function renewSourceDeletionClaim(
  env: Env,
  input: {
    actorUserId: string;
    deletionStartedAt: string;
    sourceFileId: string;
  },
): Promise<string | null> {
  const renewedAt = nextSourceDeletionLeaseToken(input.deletionStartedAt);
  const result = await env.DB.prepare(
    `
      /* renew_source_deletion_claim */
      UPDATE source_files
      SET deletion_started_at = ?, deletion_started_by = ?
      WHERE id = ? AND deleted_at IS NULL AND deletion_started_at = ?
    `,
  )
    .bind(renewedAt, input.actorUserId, input.sourceFileId, input.deletionStartedAt)
    .run();
  return (result.meta.changes ?? 0) === 1 ? renewedAt : null;
}

async function sourceDeletionClaimLostResult(
  env: Env,
  sourceFileId: string,
): Promise<DeleteSourceResult> {
  const current = await readSourceLifecycleRow(env, sourceFileId);
  return {
    sourceFileId,
    status: current?.deleted_at ? "already_deleted" : "deletion_in_progress",
    retention: "report_only",
  };
}

function prepareSourceDeletionClaimChangeAssertion(
  env: Env,
  sourceFileId: string,
  deletionStartedAt: string,
): D1PreparedStatement {
  return env.DB.prepare(
    `
      SELECT json(
        CASE
          WHEN changes() = 1 AND EXISTS (
            SELECT 1
            FROM source_files
            WHERE id = ? AND deleted_at IS NULL AND deletion_started_at = ?
          ) THEN '{}'
          ELSE 'source_deletion_claim_lost'
        END
      )
    `,
  ).bind(sourceFileId, deletionStartedAt);
}

function prepareSourceDeletionClaimTransitionAudit(
  env: Env,
  input: {
    actorUserId: string;
    deletionStartedAt: string;
    mode: Exclude<SourceDeletionClaimMode, "new">;
    previousDeletionFailureStage: string | null;
    previousDeletionStartedAt: string | null;
    sourceFileId: string;
    staleBefore: string;
  },
): D1PreparedStatement {
  return prepareAuditInsert(
    env,
    createAuditEvent({
      action:
        input.mode === "resumed"
          ? "source_file.deletion_resumed"
          : "source_file.deletion_reclaimed",
      actor: {
        id: input.actorUserId,
        kind: "user",
      },
      subject: {
        id: input.sourceFileId,
        kind: "source_file",
      },
      metadata: {
        deletionStartedAt: input.deletionStartedAt,
        previousDeletionFailureStage: input.previousDeletionFailureStage,
        previousDeletionStartedAt: input.previousDeletionStartedAt,
        staleBefore: input.staleBefore,
      },
    }),
  );
}

function prepareSourceDeletionStalledAlert(
  env: Env,
  input: {
    failedAt: string;
    failureReason: string;
    sourceFileId: string;
    stage: string;
  },
): D1PreparedStatement {
  return env.DB.prepare(
    `
      INSERT INTO alert_events (
        id,
        severity,
        alert_type,
        entity_type,
        entity_id,
        title,
        message,
        status,
        metadata_json,
        created_at,
        acknowledged_by_user_id,
        acknowledged_at,
        resolved_at
      )
      SELECT ?, ?, 'source_file.deletion_stalled', 'source_file', ?, ?, ?, 'open', ?, ?, NULL, NULL, NULL
      WHERE EXISTS (
        SELECT 1
        FROM source_files
        WHERE id = ? AND deleted_at IS NULL AND deletion_started_at IS NOT NULL
      )
        AND NOT EXISTS (
          SELECT 1
          FROM alert_events
          WHERE alert_type = 'source_file.deletion_stalled'
            AND entity_type = 'source_file'
            AND entity_id = ?
            AND status IN ('open', 'acknowledged')
        )
    `,
  ).bind(
    crypto.randomUUID(),
    input.stage === "void_jobs" || input.stage === "cleanup_preflight" ? "warning" : "critical",
    input.sourceFileId,
    "Source deletion requires recovery",
    input.failureReason,
    JSON.stringify({ stage: input.stage }),
    input.failedAt,
    input.sourceFileId,
    input.sourceFileId,
  );
}

async function markSourceDeletionCleanupBlocked(
  env: Env,
  input: {
    adapterIdsWithoutCleanup: string[];
    deletionStartedAt: string;
    sourceFileId: string;
  },
): Promise<void> {
  const failedAt = new Date().toISOString();
  const failureReason = `Source cleanup is not supported by: ${input.adapterIdsWithoutCleanup.join(
    ", ",
  )}.`;
  await env.DB.batch([
    prepareSourceDeletionClaimAssertion(env, input.sourceFileId, input.deletionStartedAt),
    env.DB.prepare(
      `
        UPDATE source_files
        SET deletion_failure_stage = 'cleanup_preflight', deletion_failure_reason = ?
        WHERE id = ? AND deleted_at IS NULL AND deletion_started_at = ?
      `,
    ).bind(failureReason, input.sourceFileId, input.deletionStartedAt),
    prepareSourceDeletionStalledAlert(env, {
      failedAt,
      failureReason,
      sourceFileId: input.sourceFileId,
      stage: "cleanup_preflight",
    }),
  ]);
}

function prepareResolveSourceDeletionAlert(
  env: Env,
  sourceFileId: string,
  resolvedAt: string,
): D1PreparedStatement {
  return env.DB.prepare(
    `
      UPDATE alert_events
      SET status = 'resolved', resolved_at = ?
      WHERE alert_type = 'source_file.deletion_stalled'
        AND entity_type = 'source_file'
        AND entity_id = ?
        AND status IN ('open', 'acknowledged')
    `,
  ).bind(resolvedAt, sourceFileId);
}

function prepareSourceDeletionClaimAssertion(
  env: Env,
  sourceFileId: string,
  deletionStartedAt: string,
): D1PreparedStatement {
  return env.DB.prepare(
    `
      SELECT json(
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM source_files
            WHERE id = ? AND deleted_at IS NULL AND deletion_started_at = ?
          ) THEN '{}'
          ELSE 'source_deletion_claim_lost'
        END
      )
    `,
  ).bind(sourceFileId, deletionStartedAt);
}

function prepareSourceDeletedAudit(
  env: Env,
  source: SourceLifecycleRow,
  actorUserId: string,
  deletedAt: string,
  importJobIds: string[],
): D1PreparedStatement {
  return prepareAuditInsert(
    env,
    createAuditEvent({
      action: "source_file.deleted",
      actor: {
        id: actorUserId,
        kind: "user",
      },
      subject: {
        id: source.id,
        kind: "source_file",
      },
      metadata: {
        deletedAt,
        importJobIds,
        objectKey: source.object_key,
        retention: "report_only",
      },
    }),
  );
}

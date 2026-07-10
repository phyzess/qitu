import { deleteSourceFile, type DeleteSourceResult } from "./source-delete-service";
import { SOURCE_DELETION_LEASE_MS } from "./source-deletion-lease";

type RecoverableSourceDeletionRow = {
  id: string;
  deletion_started_by: string | null;
};

export type SourceDeletionRecoverySummary = {
  scanned: number;
  recovered: number;
  deferred: number;
  failed: number;
};

export async function recoverClaimedSourceDeletion(
  env: Env,
  input: { actorUserId: string | null; sourceFileId: string },
): Promise<DeleteSourceResult> {
  return deleteSourceFile(env, {
    actorUserId: input.actorUserId ?? "system:source-deletion-recovery",
    sourceFileId: input.sourceFileId,
  });
}

export async function recoverPendingSourceDeletions(
  env: Env,
  input: { limit?: number; now?: number } = {},
): Promise<SourceDeletionRecoverySummary> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const staleBefore = new Date((input.now ?? Date.now()) - SOURCE_DELETION_LEASE_MS).toISOString();
  const rows = await env.DB.prepare(
    `
      SELECT id, deletion_started_by
      FROM source_files
      WHERE deleted_at IS NULL
        AND deletion_started_at IS NOT NULL
        AND (
          deletion_failure_stage IS NOT NULL
          OR deletion_started_at <= ?
        )
      ORDER BY deletion_started_at ASC
      LIMIT ?
    `,
  )
    .bind(staleBefore, limit)
    .all<RecoverableSourceDeletionRow>();

  const summary: SourceDeletionRecoverySummary = {
    scanned: rows.results.length,
    recovered: 0,
    deferred: 0,
    failed: 0,
  };
  for (const row of rows.results) {
    try {
      const result = await recoverClaimedSourceDeletion(env, {
        actorUserId: row.deletion_started_by,
        sourceFileId: row.id,
      });
      if (result.status === "deleted" || result.status === "already_deleted") {
        summary.recovered += 1;
      } else if (result.status === "delete_failed") {
        summary.failed += 1;
      } else {
        summary.deferred += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.error(
        JSON.stringify({
          error: error instanceof Error ? error.message : "unknown error",
          message: "Scheduled source deletion recovery failed.",
          sourceFileId: row.id,
        }),
      );
    }
  }

  return summary;
}

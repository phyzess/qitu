export const IMPORT_REVIEW_MUTATION_LEASE_MS = 5 * 60 * 1_000;
export const IMPORT_DISPATCH_MUTATION_LEASE_MS = 30_000;

export type ImportReviewMutationKind =
  | "adjust_record"
  | "auto_commit"
  | "commit"
  | "confirm_pending"
  | "record_decision"
  | "redispatch"
  | "retry";

export type ImportReviewMutationClaim = {
  kind: ImportReviewMutationKind;
  previousStatus: string;
  startedAt: string;
  status: string;
  token: string;
};

export async function claimImportReviewMutation(
  env: Env,
  input: {
    enterCommitting?: boolean;
    expectedStatus: string;
    importJobId: string;
    kind: ImportReviewMutationKind;
    processingStartedAt: string | null;
  },
): Promise<ImportReviewMutationClaim | null> {
  const current = await env.DB.prepare(
    `
      SELECT status, mutation_kind, mutation_previous_status
      FROM import_jobs
      WHERE id = ?
      LIMIT 1
    `,
  )
    .bind(input.importJobId)
    .first<{
      mutation_kind: string | null;
      mutation_previous_status: string | null;
      status: string;
    }>();
  if (!current || current.status !== input.expectedStatus) return null;
  if (current.status === "committing" && current.mutation_kind !== input.kind) return null;

  const startedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - mutationLeaseMs(input.kind)).toISOString();
  const token = crypto.randomUUID();
  const status = input.enterCommitting ? "committing" : input.expectedStatus;
  const result = await env.DB.prepare(
    `
      UPDATE import_jobs
      SET
        status = ?,
        mutation_token = ?,
        mutation_started_at = ?,
        mutation_kind = ?,
        mutation_previous_status = CASE
          WHEN status = 'committing' THEN mutation_previous_status
          ELSE status
        END,
        updated_at = ?
      WHERE id = ?
        AND status = ?
        AND processing_started_at IS ?
        AND (status != 'committing' OR mutation_kind = ?)
        AND (mutation_token IS NULL OR mutation_started_at <= ?)
        AND EXISTS (
          SELECT 1
          FROM source_files
          WHERE source_files.id = import_jobs.source_file_id
            AND source_files.deletion_started_at IS NULL
            AND source_files.deleted_at IS NULL
        )
    `,
  )
    .bind(
      status,
      token,
      startedAt,
      input.kind,
      startedAt,
      input.importJobId,
      input.expectedStatus,
      input.processingStartedAt,
      input.kind,
      staleBefore,
    )
    .run();
  if ((result.meta.changes ?? 0) === 0) return null;

  return {
    kind: input.kind,
    previousStatus:
      current.status === "committing"
        ? (current.mutation_previous_status ?? "needs_review")
        : current.status,
    startedAt,
    status,
    token,
  };
}

export async function releaseImportReviewMutation(
  env: Env,
  input: {
    claim: ImportReviewMutationClaim;
    currentStatus?: string;
    importJobId: string;
    status?: string;
  },
): Promise<boolean> {
  const releasedAt = new Date().toISOString();
  const result = await env.DB.prepare(
    `
      UPDATE import_jobs
      SET
        status = ?,
        mutation_token = NULL,
        mutation_started_at = NULL,
        mutation_kind = NULL,
        mutation_previous_status = NULL,
        updated_at = ?
      WHERE id = ?
        AND status = ?
        AND mutation_token = ?
    `,
  )
    .bind(
      input.status ?? input.claim.previousStatus,
      releasedAt,
      input.importJobId,
      input.currentStatus ?? input.claim.status,
      input.claim.token,
    )
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export function importReviewMutationRetryDelaySeconds(
  mutationStartedAt: string | null,
  mutationKind?: string | null,
  now = Date.now(),
): number {
  const startedAt = mutationStartedAt ? Date.parse(mutationStartedAt) : Number.NaN;
  if (!Number.isFinite(startedAt)) return 1;

  const remainingMilliseconds = startedAt + mutationLeaseMs(mutationKind) - now;
  return remainingMilliseconds > 0 ? Math.ceil(remainingMilliseconds / 1_000) + 1 : 1;
}

export function isImportReviewMutationStale(
  mutationStartedAt: string | null,
  mutationKind?: string | null,
  now = Date.now(),
): boolean {
  const startedAt = mutationStartedAt ? Date.parse(mutationStartedAt) : Number.NaN;
  return Number.isFinite(startedAt) && startedAt + mutationLeaseMs(mutationKind) <= now;
}

export function mutationLeaseMs(kind?: string | null): number {
  return kind === "redispatch" || kind === "retry"
    ? IMPORT_DISPATCH_MUTATION_LEASE_MS
    : IMPORT_REVIEW_MUTATION_LEASE_MS;
}

export const SOURCE_DELETION_LEASE_MS = 15 * 60 * 1_000;

export function isSourceDeletionRecoveryDue(
  deletionStartedAt: string | null,
  deletionFailureStage: string | null,
  now = Date.now(),
): boolean {
  if (deletionFailureStage) return true;
  const startedAt = deletionStartedAt ? Date.parse(deletionStartedAt) : Number.NaN;
  return Number.isFinite(startedAt) && startedAt + SOURCE_DELETION_LEASE_MS <= now;
}

export function sourceDeletionRetryDelaySeconds(
  deletionStartedAt: string | null,
  deletionFailureStage: string | null = null,
  now = Date.now(),
): number {
  if (deletionFailureStage) return 1;
  const startedAt = deletionStartedAt ? Date.parse(deletionStartedAt) : Number.NaN;
  if (!Number.isFinite(startedAt)) return 1;

  const remainingMilliseconds = startedAt + SOURCE_DELETION_LEASE_MS - now;
  return remainingMilliseconds > 0 ? Math.ceil(remainingMilliseconds / 1_000) + 1 : 1;
}

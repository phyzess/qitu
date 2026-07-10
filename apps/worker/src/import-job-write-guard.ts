export type ImportJobWriteGuard = {
  importJobId: string;
  processingStartedAt: string | null;
  processingOwner?: string;
  status: string;
  mutationToken?: string;
  updatedAt?: string;
  allowInactiveSource?: boolean;
};

export function activeImportJobGuardSql(
  jobAlias = "guard_import_job",
  sourceAlias = "guard_source_file",
): string {
  return `
    EXISTS (
      SELECT 1
      FROM import_jobs AS ${jobAlias}
      INNER JOIN source_files AS ${sourceAlias}
        ON ${sourceAlias}.id = ${jobAlias}.source_file_id
      WHERE ${jobAlias}.id = ?
        AND ${jobAlias}.status = ?
        AND ${jobAlias}.processing_started_at IS ?
        AND (? IS NULL OR ${jobAlias}.processing_owner = ?)
        AND (? IS NULL OR ${jobAlias}.mutation_token = ?)
        AND (? IS NULL OR ${jobAlias}.updated_at = ?)
        AND (
          ? = 1
          OR (
            ${sourceAlias}.deletion_started_at IS NULL
            AND ${sourceAlias}.deleted_at IS NULL
          )
        )
    )
  `;
}

export function importJobWriteGuardBindings(
  guard: ImportJobWriteGuard,
): Array<number | string | null> {
  return [
    guard.importJobId,
    guard.status,
    guard.processingStartedAt,
    guard.processingOwner ?? null,
    guard.processingOwner ?? null,
    guard.mutationToken ?? null,
    guard.mutationToken ?? null,
    guard.updatedAt ?? null,
    guard.updatedAt ?? null,
    guard.allowInactiveSource ? 1 : 0,
  ];
}

export async function importJobMatchesWriteGuard(
  env: Env,
  guard: ImportJobWriteGuard,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `
      SELECT 1 AS matches_guard
      FROM import_jobs
      INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
      WHERE import_jobs.id = ?
        AND import_jobs.status = ?
        AND import_jobs.processing_started_at IS ?
        AND (? IS NULL OR import_jobs.processing_owner = ?)
        AND (? IS NULL OR import_jobs.mutation_token = ?)
        AND (? IS NULL OR import_jobs.updated_at = ?)
        AND (
          ? = 1
          OR (
            source_files.deletion_started_at IS NULL
            AND source_files.deleted_at IS NULL
          )
        )
      LIMIT 1
    `,
  )
    .bind(...importJobWriteGuardBindings(guard))
    .first<{ matches_guard: number }>();

  return row?.matches_guard === 1;
}

export function prepareImportJobWriteGuardAssertion(
  env: Env,
  guard: ImportJobWriteGuard,
): D1PreparedStatement {
  return env.DB.prepare(
    `
      SELECT json(
        CASE
          WHEN ${activeImportJobGuardSql()} THEN '{}'
          ELSE 'import_job_write_guard_lost'
        END
      )
    `,
  ).bind(...importJobWriteGuardBindings(guard));
}

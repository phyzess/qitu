export type DuplicateSourceFileRow = {
  source_file_id: string;
  object_key: string;
  import_job_id: string | null;
  status: string | null;
  deletion_started_at: string | null;
};

export async function findDuplicateSourceFile(
  env: Env,
  input: {
    contentHash: string;
    workspaceId: string;
  },
): Promise<DuplicateSourceFileRow | null> {
  return env.DB.prepare(
    `
      SELECT
        source_files.id AS source_file_id,
        source_files.object_key,
        import_jobs.id AS import_job_id,
        import_jobs.status,
        source_files.deletion_started_at
      FROM source_files
      LEFT JOIN import_jobs ON import_jobs.source_file_id = source_files.id
      WHERE source_files.workspace_id = ?
        AND source_files.content_hash = ?
        AND source_files.deleted_at IS NULL
      ORDER BY
        source_files.uploaded_at DESC,
        import_jobs.created_at DESC,
        import_jobs.rowid DESC
      LIMIT 1
    `,
  )
    .bind(input.workspaceId, input.contentHash)
    .first<DuplicateSourceFileRow>();
}

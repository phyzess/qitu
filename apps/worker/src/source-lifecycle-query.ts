export type SourceLifecycleRow = {
  id: string;
  workspace_id: string;
  object_key: string;
  filename: string;
  content_type: string;
  content_hash: string | null;
  size: number | null;
  uploaded_by: string;
  uploaded_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_started_at: string | null;
  deletion_started_by: string | null;
  deletion_failure_stage: string | null;
  deletion_failure_reason: string | null;
};

export type SourceImportJobRow = {
  id: string;
  adapter_id: string | null;
  status: string;
  mutation_token: string | null;
  mutation_started_at: string | null;
  mutation_kind: string | null;
};

export async function readSourceLifecycleRow(
  env: Env,
  sourceFileId: string,
): Promise<SourceLifecycleRow | null> {
  return env.DB.prepare(
    `
      SELECT
        id,
        workspace_id,
        object_key,
        filename,
        content_type,
        content_hash,
        size,
        uploaded_by,
        uploaded_at,
        deleted_at,
        deleted_by,
        deletion_started_at,
        deletion_started_by,
        deletion_failure_stage,
        deletion_failure_reason
      FROM source_files
      WHERE id = ?
      LIMIT 1
    `,
  )
    .bind(sourceFileId)
    .first<SourceLifecycleRow>();
}

export async function readSourceImportJobs(
  env: Env,
  sourceFileId: string,
): Promise<SourceImportJobRow[]> {
  const result = await env.DB.prepare(
    `
      SELECT id, adapter_id, status, mutation_token, mutation_started_at, mutation_kind
      FROM import_jobs
      WHERE source_file_id = ?
      ORDER BY created_at ASC
    `,
  )
    .bind(sourceFileId)
    .all<SourceImportJobRow>();

  return result.results;
}

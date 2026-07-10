export type ImportProcessingJobRow = {
  id: string;
  source_file_id: string;
  status: string;
  job_kind: string | null;
  adapter_id: string | null;
  failure_reason: string | null;
  failure_class: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  processing_started_at: string | null;
  processing_owner: string | null;
  processing_lease_expires_at: string | null;
  mutation_token: string | null;
  mutation_started_at: string | null;
  mutation_kind: string | null;
  mutation_previous_status: string | null;
  filename: string;
  content_type: string;
  object_key: string;
  deletion_started_at: string | null;
  deletion_started_by: string | null;
  deletion_failure_stage: string | null;
  deleted_at: string | null;
};

export async function readImportProcessingJob(
  env: Env,
  jobId: string,
): Promise<ImportProcessingJobRow | null> {
  return env.DB.prepare(
    `
      SELECT
        import_jobs.id,
        import_jobs.source_file_id,
        import_jobs.status,
        import_jobs.job_kind,
        import_jobs.adapter_id,
        import_jobs.failure_reason,
        import_jobs.failure_class,
        import_jobs.created_by,
        import_jobs.created_at,
        import_jobs.updated_at,
        import_jobs.completed_at,
        import_jobs.processing_started_at,
        import_jobs.processing_owner,
        import_jobs.processing_lease_expires_at,
        import_jobs.mutation_token,
        import_jobs.mutation_started_at,
        import_jobs.mutation_kind,
        import_jobs.mutation_previous_status,
        source_files.filename,
        source_files.content_type,
        source_files.object_key,
        source_files.deletion_started_at,
        source_files.deletion_started_by,
        source_files.deletion_failure_stage,
        source_files.deleted_at
      FROM import_jobs
      INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
      WHERE import_jobs.id = ?
      LIMIT 1
    `,
  )
    .bind(jobId)
    .first<ImportProcessingJobRow>();
}

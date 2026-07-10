import type { ImportJobReviewRow } from "./import-review-row-types";

export async function readImportJobReview(
  env: Env,
  jobId: string,
): Promise<ImportJobReviewRow | null> {
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
        import_jobs.mutation_token,
        import_jobs.mutation_started_at,
        import_jobs.mutation_kind,
        import_jobs.mutation_previous_status,
        source_files.filename,
        source_files.content_type,
        source_files.object_key,
        source_files.deletion_started_at,
        source_files.deleted_at
      FROM import_jobs
      INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
      WHERE import_jobs.id = ?
      LIMIT 1
    `,
  )
    .bind(jobId)
    .first<ImportJobReviewRow>();
}

import type { ImportReviewIssueRow } from "./import-review-row-types";

export async function readImportReviewIssues(
  env: Env,
  jobId: string,
): Promise<ImportReviewIssueRow[]> {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        staged_record_key,
        code,
        message,
        severity,
        status,
        created_at
      FROM import_review_issues
      WHERE import_job_id = ?
      ORDER BY created_at ASC
    `,
  )
    .bind(jobId)
    .all<ImportReviewIssueRow>();

  return result.results;
}

export async function readOpenErrorReviewIssues(
  env: Env,
  input: { jobId: string; stagedRecordKeys?: string[] },
): Promise<ImportReviewIssueRow[]> {
  if (input.stagedRecordKeys?.length === 0) {
    return [];
  }

  const result = await env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        staged_record_key,
        code,
        message,
        severity,
        status,
        created_at
      FROM import_review_issues
      WHERE import_job_id = ?
        AND severity = 'error'
        AND status = 'open'
      ORDER BY created_at ASC
    `,
  )
    .bind(input.jobId)
    .all<ImportReviewIssueRow>();

  if (!input.stagedRecordKeys) {
    return result.results;
  }

  const stagedRecordKeys = new Set(input.stagedRecordKeys);
  return result.results.filter((issue) => stagedRecordKeys.has(issue.staged_record_key));
}

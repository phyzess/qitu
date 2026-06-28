import { summarizeReviewStatuses } from "@qitu/import-pipeline";

export async function readImportReviewStats(
  env: Env,
  jobId: string,
): Promise<{
  recordCount: number;
  issueCount: number;
  pending: number;
  approved: number;
  rejected: number;
  committed: number;
}> {
  const [recordsResult, issuesCount] = await Promise.all([
    env.DB.prepare(
      `
        SELECT review_status
        FROM example_staged_records
        WHERE import_job_id = ?
      `,
    )
      .bind(jobId)
      .all<{ review_status: string }>(),
    env.DB.prepare(
      `
        SELECT COUNT(*) AS issue_count
        FROM import_review_issues
        WHERE import_job_id = ?
          AND status = 'open'
      `,
    )
      .bind(jobId)
      .first<{ issue_count: number }>(),
  ]);

  const counts = summarizeReviewStatuses(
    recordsResult.results.map((record) => record.review_status),
  );

  return {
    recordCount: recordsResult.results.length,
    issueCount: Number(issuesCount?.issue_count ?? 0),
    ...counts,
  };
}

import { assert } from "./worker-integration-http.mjs";

export async function processCsvUploadForReview({ client, env, upload, worker }) {
  const fastPathReview = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  assert(
    fastPathReview.job.status === "needs_review",
    "upload schedules fast import processing before queue consumption",
  );
  assert(fastPathReview.records.length === 1, "fast import processing stages review records");

  await worker.queue(
    {
      messages: env.IMPORT_JOBS.messages.map((body) => ({ body })),
    },
    env,
  );

  const review = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  assert(
    review.job.status === "needs_review",
    `queue moves import job to needs_review, got ${review.job.status}: ${review.job.failureReason}`,
  );
  assert(review.records.length === 1, "queue creates staged review record");
  assert(review.issues.length === 1, "queue creates review issue");
  const processedJob = await env.DB.prepare(
    "SELECT attempt_count FROM import_jobs WHERE id = ? LIMIT 1",
  )
    .bind(upload.importJobId)
    .first();
  assert(
    processedJob?.attempt_count === 1,
    "fast path and queue fallback claim queued import work atomically",
  );

  return review;
}

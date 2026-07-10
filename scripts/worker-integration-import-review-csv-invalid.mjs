import { assert, expectApiError, expectStatus } from "./worker-integration-http.mjs";

export async function testCsvInvalidNumberReview({ client, env, worker }) {
  const invalidUpload = await client.json("/api/source-files", {
    method: "POST",
    body: "label,value\nBad Amount,not-a-number\n",
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture-invalid-number.txt",
      "x-workspace-id": "default",
    },
  });
  const invalidMessage = env.IMPORT_JOBS.messages.at(-1);
  assert(invalidMessage?.jobId === invalidUpload.importJobId, "invalid fixture is queued");

  await worker.queue(
    {
      messages: [{ body: invalidMessage }],
    },
    env,
  );

  const invalidReview = await client.json(`/api/import-jobs/${invalidUpload.importJobId}/review`);
  const invalidIssueCodes = new Set(invalidReview.issues.map((issue) => issue.code));
  assert(invalidReview.job.status === "needs_review", "invalid number stays in review");
  assert(invalidReview.records.length === 1, "invalid fixture stages one record");
  assert(
    invalidReview.records[0]?.payload?.normalizedLabel === "bad amount",
    "invalid fixture still normalizes staged payload for review",
  );
  assert(
    invalidIssueCodes.has("manual_review_required") && invalidIssueCodes.has("invalid_number"),
    "invalid fixture records both confirmation and adapter validation issues",
  );
  const invalidRecord = invalidReview.records[0];
  await expectApiError(
    await client.request(
      `/api/import-jobs/${invalidUpload.importJobId}/staged-records/${invalidRecord.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({ note: "ordinary approval must stay blocked" }),
        headers: { "content-type": "application/json" },
      },
    ),
    409,
    "open_review_errors",
  );
  await expectApiError(
    await client.request(`/api/import-jobs/${invalidUpload.importJobId}/review/confirm-pending`, {
      method: "POST",
      body: JSON.stringify({ note: "batch confirmation must stay blocked" }),
      headers: { "content-type": "application/json" },
    }),
    409,
    "open_review_errors",
  );

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE example_staged_records SET review_status = 'approved' WHERE id = ?",
    ).bind(invalidRecord.id),
    env.DB.prepare("UPDATE import_jobs SET status = 'approved' WHERE id = ?").bind(
      invalidUpload.importJobId,
    ),
  ]);
  await expectApiError(
    await client.request(`/api/import-jobs/${invalidUpload.importJobId}/commit`, {
      method: "POST",
    }),
    409,
    "open_review_errors",
  );
  await env.DB.batch([
    env.DB.prepare("UPDATE example_staged_records SET review_status = 'pending' WHERE id = ?").bind(
      invalidRecord.id,
    ),
    env.DB.prepare("UPDATE import_jobs SET status = 'needs_review' WHERE id = ?").bind(
      invalidUpload.importJobId,
    ),
  ]);

  await expectStatus(
    await client.request(`/api/import-jobs/${invalidUpload.importJobId}/commit`, {
      method: "POST",
    }),
    409,
  );
}

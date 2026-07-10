import { assert } from "./worker-integration-http.mjs";

const jsonHeaders = { "content-type": "application/json" };

export async function testOpenErrorOverride({
  autoCommitCleanImport,
  client,
  env,
  getImportAdapter,
  worker,
}) {
  const upload = await client.json("/api/source-files", {
    method: "POST",
    body: JSON.stringify([{ key: " ", value: 42 }]),
    headers: {
      ...jsonHeaders,
      "x-filename": "fixture-error-override.json",
      "x-workspace-id": "default",
    },
  });
  const message = env.IMPORT_JOBS.messages.at(-1);
  await worker.queue({ messages: [{ body: message }] }, env);

  const review = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  const record = review.records[0];
  assert(
    review.issues.some((issue) => issue.code === "empty_key" && issue.status === "open"),
    "error override fixture starts with an open validation error",
  );
  const adapter = getImportAdapter("starter.json-records");
  const errorAutoCommit = await autoCommitCleanImport(env, {
    adapter: { ...adapter, commitPolicy: "auto_when_clean" },
    importJobId: upload.importJobId,
  });
  assert(errorAutoCommit === false, "auto_when_clean never confirms a row with open errors");

  const approved = await client.json(
    `/api/import-jobs/${upload.importJobId}/staged-records/${record.id}/approve`,
    {
      method: "POST",
      body: JSON.stringify({
        note: "explicitly accept this staged-record error",
        overrideOpenErrors: true,
      }),
      headers: jsonHeaders,
    },
  );
  assert(approved.record.reviewStatus === "approved", "explicit override approves the record");

  const acceptedReview = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  assert(
    acceptedReview.issues.some(
      (issue) => issue.code === "empty_key" && issue.status === "accepted",
    ),
    "explicit override marks the error issue accepted",
  );

  const countEvidence = async () => {
    const event = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM import_job_events WHERE import_job_id = ? AND event_type = 'import_review.open_errors_accepted'",
    )
      .bind(upload.importJobId)
      .first();
    const audit = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'import_review.open_errors_accepted' AND subject_id = ?",
    )
      .bind(record.id)
      .first();
    return { events: Number(event?.count ?? 0), audits: Number(audit?.count ?? 0) };
  };
  assert(
    JSON.stringify(await countEvidence()) === JSON.stringify({ events: 1, audits: 1 }),
    "error acceptance writes one job event and one audit event",
  );

  const duplicate = await client.json(
    `/api/import-jobs/${upload.importJobId}/staged-records/${record.id}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ overrideOpenErrors: true }),
      headers: jsonHeaders,
    },
  );
  assert(duplicate.duplicate === true, "repeating an accepted override is idempotent");
  assert(
    JSON.stringify(await countEvidence()) === JSON.stringify({ events: 1, audits: 1 }),
    "idempotent override does not duplicate acceptance evidence",
  );

  const commit = await client.json(`/api/import-jobs/${upload.importJobId}/commit`, {
    method: "POST",
  });
  assert(commit.status === "committed", "accepted error can use the ordinary commit path");

  const mixedUpload = await client.json("/api/source-files", {
    method: "POST",
    body: JSON.stringify([
      { key: "clean-row", value: 7 },
      { key: " ", value: 9 },
    ]),
    headers: {
      ...jsonHeaders,
      "x-filename": "fixture-mixed-error-review.json",
      "x-workspace-id": "default",
    },
  });
  const mixedMessage = env.IMPORT_JOBS.messages.at(-1);
  await worker.queue({ messages: [{ body: mixedMessage }] }, env);

  const mixedReview = await client.json(`/api/import-jobs/${mixedUpload.importJobId}/review`);
  const cleanRecord = mixedReview.records.find((item) => item.payload.key === "clean-row");
  const invalidRecord = mixedReview.records.find((item) => item.payload.key.trim() === "");
  await client.json(
    `/api/import-jobs/${mixedUpload.importJobId}/staged-records/${cleanRecord.id}/approve`,
    { method: "POST", body: "{}", headers: jsonHeaders },
  );
  await client.json(
    `/api/import-jobs/${mixedUpload.importJobId}/staged-records/${invalidRecord.id}/reject`,
    { method: "POST", body: "{}", headers: jsonHeaders },
  );

  const mixedCommit = await client.json(`/api/import-jobs/${mixedUpload.importJobId}/commit`, {
    method: "POST",
  });
  assert(
    mixedCommit.committedRecords.length === 1 &&
      mixedCommit.committedRecords[0].payload.key === "clean-row",
    "a rejected row's open error does not block an approved clean row from committing",
  );
  const partialVoidResponse = await client.request(
    `/api/import-jobs/${mixedUpload.importJobId}/void`,
    { method: "POST" },
  );
  assert(partialVoidResponse.status === 409, "a partially committed job cannot be voided directly");
  const partialVoidBody = await partialVoidResponse.json();
  assert(
    partialVoidBody.error?.code === "committed_import_job",
    "partial commit void denial requires the source cleanup path",
  );
}

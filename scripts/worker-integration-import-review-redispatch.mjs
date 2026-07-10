import { assert } from "./worker-integration-http.mjs";

export async function testQueuedImportRedispatch({ client, env }) {
  const upload = await client.json("/api/source-files", {
    method: "POST",
    body: "label,value\nRedispatch queued,3.000\n",
    headers: {
      "content-type": "text/plain",
      "x-disable-fast-import": "1",
      "x-filename": "fixture-queued-redispatch.txt",
      "x-workspace-id": "default",
    },
  });
  const queuedJob = await env.DB.prepare("SELECT status FROM import_jobs WHERE id = ? LIMIT 1")
    .bind(upload.importJobId)
    .first();
  assert(queuedJob?.status === "queued", "local test header leaves the import job queued");

  const queueMessageCount = env.IMPORT_JOBS.messages.length;
  const redispatch = await client.json(`/api/import-jobs/${upload.importJobId}/dispatch`, {
    method: "POST",
  });
  assert(redispatch.status === "queued", "queued import job can be dispatched again");
  assert(
    env.IMPORT_JOBS.messages.length === queueMessageCount + 1,
    "queued redispatch preserves the Queue fallback",
  );

  const review = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  assert(review.job.status === "needs_review", "redispatch schedules fast import processing");
  const event = await env.DB.prepare(
    "SELECT event_type FROM import_job_events WHERE import_job_id = ? AND event_type = 'import_job.dispatch_retried' LIMIT 1",
  )
    .bind(upload.importJobId)
    .first();
  assert(event?.event_type === "import_job.dispatch_retried", "redispatch writes a job event");
  const audit = await env.DB.prepare(
    "SELECT action FROM audit_events WHERE subject_id = ? AND action = 'import_job.dispatch_retried' LIMIT 1",
  )
    .bind(upload.importJobId)
    .first();
  assert(audit?.action === "import_job.dispatch_retried", "redispatch writes an audit event");
}

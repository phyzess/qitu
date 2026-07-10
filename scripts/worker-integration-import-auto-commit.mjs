import { assert } from "./worker-integration-http.mjs";

export async function testImportCommitPolicies({
  autoCommitCleanImport,
  client,
  env,
  getImportAdapter,
  worker,
}) {
  const upload = await client.json("/api/source-files", {
    method: "POST",
    body: JSON.stringify({ automatic: true }),
    headers: {
      "content-type": "application/json",
      "x-filename": "fixture-commit-policy.json",
      "x-workspace-id": "default",
    },
  });
  const message = env.IMPORT_JOBS.messages.at(-1);
  await worker.queue({ messages: [{ body: message }] }, env);

  const manualAdapter = getImportAdapter("starter.json-records");
  assert(manualAdapter, "manual JSON adapter is registered");
  const manualResult = await autoCommitCleanImport(env, {
    adapter: manualAdapter,
    importJobId: upload.importJobId,
  });
  assert(manualResult === false, "missing commit policy keeps the adapter manual");
  const manualReview = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  assert(manualReview.job.status === "needs_review", "manual mode keeps clean rows in review");

  const autoResult = await autoCommitCleanImport(env, {
    adapter: { ...manualAdapter, autoCommitCleanImports: true },
    importJobId: upload.importJobId,
  });
  assert(autoResult === true, "explicit auto_when_clean policy confirms and commits clean rows");
  const committedReview = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  assert(committedReview.job.status === "committed", "auto policy leaves the job committed");
  assert(
    committedReview.records.every((record) => record.reviewStatus === "committed"),
    "auto policy uses the same committed staged-record state",
  );
  assert(
    committedReview.issues.every(
      (issue) => issue.code !== "manual_review_required" || issue.status !== "open",
    ),
    "auto policy does not leave a contradictory open manual-review issue",
  );
  const automaticAudit = await env.DB.prepare(
    "SELECT actor_id, actor_kind, metadata_json FROM audit_events WHERE action = 'import_job.committed' AND subject_id = ? ORDER BY occurred_at DESC LIMIT 1",
  )
    .bind(upload.importJobId)
    .first();
  assert(
    automaticAudit.actor_id === "system:auto-commit" &&
      automaticAudit.actor_kind === "system" &&
      JSON.parse(automaticAudit.metadata_json).automatic === true,
    "auto commit audit identifies the system executor and policy path",
  );

  const recoveryUpload = await client.json("/api/source-files", {
    method: "POST",
    body: JSON.stringify({ resumable: true }),
    headers: {
      "content-type": "application/json",
      "x-filename": "fixture-auto-commit-recovery.json",
      "x-workspace-id": "default",
    },
  });
  const recoveryMessage = env.IMPORT_JOBS.messages.at(-1);
  await worker.queue({ messages: [{ body: recoveryMessage }] }, env);

  let failedAsExpected = false;
  try {
    await autoCommitCleanImport(env, {
      adapter: {
        ...manualAdapter,
        commitPolicy: "auto_when_clean",
        async commitApproved() {
          throw new Error("simulated first commit failure");
        },
      },
      importJobId: recoveryUpload.importJobId,
    });
  } catch (error) {
    failedAsExpected = error instanceof Error && error.message === "simulated first commit failure";
  }
  assert(failedAsExpected, "auto commit exposes the first adapter failure for retry handling");

  const approvedAfterFailure = await manualAdapter.reviewStore.readApprovedStagedRecords(
    env,
    recoveryUpload.importJobId,
  );
  assert(
    approvedAfterFailure.length === 1,
    "a failed auto commit retains approved staged work for recovery",
  );
  const recovered = await autoCommitCleanImport(env, {
    adapter: { ...manualAdapter, commitPolicy: "auto_when_clean" },
    importJobId: recoveryUpload.importJobId,
  });
  assert(recovered === true, "auto commit resumes approved work after a prior commit failure");
  const recoveryReview = await client.json(`/api/import-jobs/${recoveryUpload.importJobId}/review`);
  const recoveredCommittedCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM example_committed_records WHERE import_job_id = ?",
  )
    .bind(recoveryUpload.importJobId)
    .first();
  assert(
    recoveryReview.job.status === "committed" &&
      recoveryReview.records.every((record) => record.reviewStatus === "committed") &&
      Number(recoveredCommittedCount.count) === 1,
    "resumed auto commit writes one committed record without duplicate business output",
  );
}

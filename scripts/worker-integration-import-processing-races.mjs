import { assert, createClient } from "./worker-integration-http.mjs";

const jsonHeaders = { "content-type": "application/json" };

export async function testImportProcessingRaces({
  client,
  env,
  getImportAdapter,
  processImportJob,
  worker,
}) {
  await testFastPathFailureFallsBackToQueue({ client, env, getImportAdapter, worker });
  await testAbandonedFastPathLeaseIsTakenOver({
    client,
    env,
    getImportAdapter,
    processImportJob,
    worker,
  });
  await testVoidCompareAndSwapEvidence({ client, env });
  await testSourceDeleteCancelsInFlightStaging({
    env,
    getImportAdapter,
    processImportJob,
    worker,
  });
  await testDeletionFailureRetainsClaimedQueueWork({
    client,
    env,
    getImportAdapter,
    processImportJob,
    worker,
  });
  await testFreshAutoCommitClaimBlocksVoid({
    client,
    env,
    getImportAdapter,
    processImportJob,
  });
}

async function testDeletionFailureRetainsClaimedQueueWork({
  client,
  env,
  getImportAdapter,
  processImportJob,
  worker,
}) {
  const upload = await uploadTextFixture(
    client,
    "fixture-delete-claim-release.txt",
    "Delete claim release,4.0045",
    true,
  );
  const message = queueMessageForJob(env, upload.importJobId);
  const adapter = getImportAdapter("starter.import-review");
  assert(adapter, "starter text adapter is registered for deletion retry coverage");
  const originalParseAndStage = adapter.parseAndStage;
  const parseEntered = deferred();
  const releaseParse = deferred();
  adapter.parseAndStage = async (source) => {
    parseEntered.resolve();
    await releaseParse.promise;
    return originalParseAndStage(source);
  };

  const processing = processImportJob(env, message, { mode: "queue" });
  await parseEntered.promise;
  await env.DB.prepare(
    "UPDATE source_files SET deletion_started_at = ?, deletion_started_by = ? WHERE id = ?",
  )
    .bind(new Date().toISOString(), "failed-delete", upload.sourceFileId)
    .run();
  releaseParse.resolve();
  const contention = await processing;
  adapter.parseAndStage = originalParseAndStage;
  assert(
    contention.outcome === "retry" && Number(contention.retryDelaySeconds ?? 0) >= 15 * 60,
    "claimed Queue work retries when source deletion fences its staging writes",
  );
  assert(
    (await readJob(env, upload.importJobId))?.status === "processing" &&
      (await countRows(env, "example_staged_records", "import_job_id", upload.importJobId)) === 0,
    "source-deletion fence leaves no staged rows from the superseded attempt",
  );

  await env.DB.prepare(
    "UPDATE source_files SET deletion_started_at = NULL, deletion_started_by = NULL WHERE id = ?",
  )
    .bind(upload.sourceFileId)
    .run();
  await env.DB.prepare("UPDATE import_jobs SET processing_lease_expires_at = ? WHERE id = ?")
    .bind("2000-01-01T00:00:00.000Z", upload.importJobId)
    .run();
  await worker.queue({ messages: [{ body: message, retry() {} }] }, env);
  assert(
    (await readJob(env, upload.importJobId))?.status === "needs_review",
    "Queue completes after failed deletion releases its source claim",
  );
}

async function testFastPathFailureFallsBackToQueue({ client, env, getImportAdapter, worker }) {
  const adapter = getImportAdapter("starter.import-review");
  assert(adapter, "starter text adapter is registered for fast-path race coverage");
  const originalParseAndStage = adapter.parseAndStage;
  let failFastPath = true;
  adapter.parseAndStage = async (source) => {
    if (failFastPath) {
      failFastPath = false;
      throw new Error("simulated fast-path parser interruption");
    }
    return originalParseAndStage(source);
  };

  let upload;
  try {
    upload = await uploadTextFixture(client, "fixture-fast-fallback.txt", "Fast fallback,4.001");
  } finally {
    adapter.parseAndStage = originalParseAndStage;
  }

  const releasedJob = await readJob(env, upload.importJobId);
  assert(releasedJob?.status === "queued", "fast-path failure releases its lease to Queue");
  const message = queueMessageForJob(env, upload.importJobId);
  await worker.queue({ messages: [{ body: message }] }, env);
  const review = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  assert(review.job.status === "needs_review", "Queue fallback completes released fast work");
}

async function testAbandonedFastPathLeaseIsTakenOver({
  client,
  env,
  getImportAdapter,
  processImportJob,
  worker,
}) {
  const upload = await uploadTextFixture(
    client,
    "fixture-abandoned-fast-path.txt",
    "Abandoned fast path,4.002",
    true,
  );
  const message = queueMessageForJob(env, upload.importJobId);
  const adapter = getImportAdapter("starter.import-review");
  assert(adapter, "starter text adapter is registered for lease coverage");
  const originalParseAndStage = adapter.parseAndStage;
  const parseEntered = deferred();
  const releaseParse = deferred();
  adapter.parseAndStage = async (source) => {
    parseEntered.resolve();
    await releaseParse.promise;
    return originalParseAndStage(source);
  };

  const abandonedFastPath = processImportJob(env, message);
  await parseEntered.promise;
  adapter.parseAndStage = originalParseAndStage;

  let retryOptions = null;
  await worker.queue(
    {
      messages: [
        {
          body: message,
          retry(options) {
            retryOptions = options;
          },
        },
      ],
    },
    env,
  );

  await env.DB.prepare(
    "UPDATE import_jobs SET processing_started_at = ?, processing_lease_expires_at = ? WHERE id = ? AND status = 'processing'",
  )
    .bind("2000-01-01T00:00:00.000Z", "2000-01-01T00:00:30.000Z", upload.importJobId)
    .run();
  await worker.queue({ messages: [{ body: message, retry() {} }] }, env);
  releaseParse.resolve();
  await abandonedFastPath;

  assert(
    Number(retryOptions?.delaySeconds ?? 0) >= 30,
    "fresh processing lease retries after the remaining waitUntil lease",
  );
  const completedJob = await readJob(env, upload.importJobId);
  assert(completedJob?.status === "needs_review", "stale Queue delivery takes over processing");
  assert(completedJob?.attempt_count === 2, "stale takeover records a second processing attempt");
  const stagedCount = await countRows(
    env,
    "example_staged_records",
    "import_job_id",
    upload.importJobId,
  );
  assert(stagedCount === 1, "superseded attempt cannot duplicate staged app rows");
}

async function testVoidCompareAndSwapEvidence({ client, env }) {
  const upload = await uploadTextFixture(
    client,
    "fixture-void-cas.txt",
    "Void compare and swap,4.003",
    true,
  );
  env.DB.beforeRun = async ({ sql }) => {
    if (!sql.includes("status = 'voided'")) return;
    env.DB.beforeRun = null;
    env.DB.database
      .prepare(
        "UPDATE import_jobs SET status = 'processing', processing_started_at = ? WHERE id = ?",
      )
      .run(new Date().toISOString(), upload.importJobId);
  };

  let response;
  try {
    response = await client.request(`/api/import-jobs/${upload.importJobId}/void`, {
      method: "POST",
    });
  } finally {
    env.DB.beforeRun = null;
  }

  assert(response.status === 409, "void route reports a lost queued-to-voided compare-and-swap");
  const voidEventCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM import_job_events WHERE event_type = ? AND import_job_id = ?",
  )
    .bind("import_job.voided", upload.importJobId)
    .first();
  const voidEvents = Number(voidEventCount?.count ?? 0);
  assert(voidEvents === 0, "lost void compare-and-swap writes no false event evidence");
}

async function testSourceDeleteCancelsInFlightStaging({
  env,
  getImportAdapter,
  processImportJob,
  worker,
}) {
  const adminClient = await createAdminClient(worker, env);
  const upload = await uploadTextFixture(
    adminClient,
    "fixture-delete-processing.txt",
    "Delete processing,4.004",
    true,
  );
  const message = queueMessageForJob(env, upload.importJobId);
  const adapter = getImportAdapter("starter.import-review");
  assert(adapter, "starter text adapter is registered for delete race coverage");
  const originalParseAndStage = adapter.parseAndStage;
  const originalPrepareInsertStagedRecord = adapter.reviewStore.prepareInsertStagedRecord;
  const parseEntered = deferred();
  const releaseParse = deferred();
  adapter.parseAndStage = async (source) => {
    parseEntered.resolve();
    await releaseParse.promise;
    return originalParseAndStage(source);
  };
  adapter.reviewStore.prepareInsertStagedRecord = (storeEnv, input) =>
    originalPrepareInsertStagedRecord(storeEnv, { ...input, writeGuard: undefined });

  const processing = processImportJob(env, message);
  await parseEntered.promise;
  const deleted = await adminClient.json(`/api/source-files/${upload.sourceFileId}`, {
    method: "DELETE",
  });
  adapter.parseAndStage = originalParseAndStage;
  releaseParse.resolve();
  await processing;
  adapter.reviewStore.prepareInsertStagedRecord = originalPrepareInsertStagedRecord;

  assert(deleted.status === "deleted", "source delete cancels an in-flight import");
  const job = await readJob(env, upload.importJobId);
  assert(job?.status === "voided", "in-flight runner cannot resurrect a deleted source job");
  assert(
    (await countRows(env, "example_staged_records", "import_job_id", upload.importJobId)) === 0,
    "batch-level fencing protects deleted sources even when an app store ignores its optional guard",
  );
  assert(
    (await countRows(env, "import_review_issues", "import_job_id", upload.importJobId)) === 0,
    "deleted source cannot regain review issues",
  );
}

async function testFreshAutoCommitClaimBlocksVoid({
  client,
  env,
  getImportAdapter,
  processImportJob,
}) {
  const upload = await client.json("/api/source-files", {
    method: "POST",
    body: JSON.stringify({ automaticRace: 4.005 }),
    headers: {
      ...jsonHeaders,
      "x-disable-fast-import": "1",
      "x-filename": "fixture-auto-commit-void.json",
      "x-workspace-id": "default",
    },
  });
  const message = queueMessageForJob(env, upload.importJobId);
  const adapter = getImportAdapter("starter.json-records");
  assert(adapter, "starter JSON adapter is registered for auto-commit race coverage");
  const originalAutoCommit = adapter.autoCommitCleanImports;
  const originalReadApproved = adapter.reviewStore.readApprovedStagedRecords;
  const commitPreflightRead = deferred();
  const releaseCommitPreflight = deferred();
  let approvedReadCount = 0;
  adapter.autoCommitCleanImports = true;
  adapter.reviewStore.readApprovedStagedRecords = async (...args) => {
    const records = await originalReadApproved(...args);
    approvedReadCount += 1;
    if (approvedReadCount === 2) {
      commitPreflightRead.resolve();
      await releaseCommitPreflight.promise;
    }
    return records;
  };

  const processing = processImportJob(env, message);
  await commitPreflightRead.promise;
  const voidResponse = await client.request(`/api/import-jobs/${upload.importJobId}/void`, {
    method: "POST",
  });
  adapter.reviewStore.readApprovedStagedRecords = originalReadApproved;
  adapter.autoCommitCleanImports = originalAutoCommit;
  releaseCommitPreflight.resolve();
  await processing;

  assert(voidResponse.status === 409, "fresh auto-commit claim blocks a competing void");
  const job = await readJob(env, upload.importJobId);
  assert(job?.status === "committed", "auto-commit finishes under its fresh mutation claim");
  assert(
    (await countRows(env, "example_committed_records", "import_job_id", upload.importJobId)) === 1,
    "fresh claim produces one committed app row",
  );
}

async function uploadTextFixture(client, filename, row, disableFastPath = false) {
  return client.json("/api/source-files", {
    method: "POST",
    body: `label,value\n${row}\n`,
    headers: {
      "content-type": "text/plain",
      ...(disableFastPath ? { "x-disable-fast-import": "1" } : {}),
      "x-filename": filename,
      "x-workspace-id": "default",
    },
  });
}

async function createAdminClient(worker, env) {
  const client = createClient(worker, env);
  await client.json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "local-admin@example.com",
      password: "correct horse battery staple",
    }),
    headers: jsonHeaders,
  });
  return client;
}

function queueMessageForJob(env, jobId) {
  const message = env.IMPORT_JOBS.messages.findLast((candidate) => candidate.jobId === jobId);
  assert(message, `Queue message exists for ${jobId}`);
  return message;
}

async function readJob(env, jobId) {
  return env.DB.prepare(
    "SELECT id, status, attempt_count, processing_started_at FROM import_jobs WHERE id = ? LIMIT 1",
  )
    .bind(jobId)
    .first();
}

async function countRows(env, table, column, value) {
  const query = `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`;
  const row = await env.DB.prepare(query).bind(value).first();
  return Number(row?.count ?? 0);
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

import { assert, createClient } from "./worker-integration-http.mjs";

const jsonHeaders = { "content-type": "application/json" };

export async function testImportMutationRaces({
  autoCommitCleanImport,
  client,
  env,
  getImportAdapter,
  markImportJobProcessingStarted,
  voidImportJob,
  worker,
}) {
  await testProcessingClaimUsesUniqueOwner({
    client,
    env,
    markImportJobProcessingStarted,
    worker,
  });
  await testStaleDispatchClaimRecovery({ client, env, worker });
  await testSourceDeleteTakesOverStaleDispatchClaim({ client, env, worker });
  await testDeletingSourceRetriesQueueDelivery({ client, env, worker });
  await testScheduledSourceDeletionRecovery({ client, env, worker });
  await testVoidUsesClaimAndUniqueEvidence({ client, env, voidImportJob });
  await testAutoCommitExcludesManualMutations({
    autoCommitCleanImport,
    client,
    env,
    getImportAdapter,
    worker,
  });
  await testManualCommitClaimLossAndStaleResume({
    client,
    env,
    getImportAdapter,
    worker,
  });
}

async function testSourceDeleteTakesOverStaleDispatchClaim({ client, env, worker }) {
  const upload = await uploadTextFixture(
    client,
    "fixture-delete-stale-dispatch.txt",
    "Delete stale dispatch,5.00005",
  );
  await env.DB.prepare(
    `
      UPDATE import_jobs
      SET mutation_token = ?, mutation_started_at = ?, mutation_kind = 'retry'
      WHERE id = ?
    `,
  )
    .bind(
      "stale-dispatch-before-delete",
      new Date(Date.now() - 31_000).toISOString(),
      upload.importJobId,
    )
    .run();
  const adminClient = await createAdminClient(worker, env);
  const deleted = await adminClient.json(`/api/source-files/${upload.sourceFileId}`, {
    method: "DELETE",
  });
  assert(
    deleted.status === "deleted" && (await readJob(env, upload.importJobId))?.status === "voided",
    "source deletion uses the shorter dispatch lease when taking over stale claims",
  );
}

async function testDeletingSourceRetriesQueueDelivery({ client, env, worker }) {
  const upload = await uploadTextFixture(
    client,
    "fixture-source-claim-queue-retry.txt",
    "Source claim retry,5.0001",
  );
  env.DB.beforeRun = async ({ sql }) => {
    if (!sql.includes("status = 'processing'")) return;
    env.DB.beforeRun = null;
    env.DB.database
      .prepare(
        "UPDATE source_files SET deletion_started_at = ?, deletion_started_by = ? WHERE id = ?",
      )
      .run(new Date().toISOString(), "interrupted-delete", upload.sourceFileId);
  };
  let retryOptions = null;
  try {
    await worker.queue(
      {
        messages: [
          {
            body: queueMessageForJob(env, upload.importJobId),
            retry(options) {
              retryOptions = options;
            },
          },
        ],
      },
      env,
    );
  } finally {
    env.DB.beforeRun = null;
  }
  assert(
    (await readJob(env, upload.importJobId))?.status === "queued" &&
      Number(retryOptions?.delaySeconds ?? 0) >= 15 * 60,
    "Queue retains delivery when source deletion wins the processing-claim TOCTOU",
  );

  await env.DB.prepare("UPDATE source_files SET deletion_started_at = ? WHERE id = ?")
    .bind("2000-01-01T00:00:00.000Z", upload.sourceFileId)
    .run();
  let staleClaimRetried = false;
  await worker.queue(
    {
      messages: [
        {
          body: queueMessageForJob(env, upload.importJobId),
          retry() {
            staleClaimRetried = true;
          },
        },
      ],
    },
    env,
  );
  assert(
    (await readJob(env, upload.importJobId))?.status === "voided" && !staleClaimRetried,
    "a stale deletion claim is recovered and acknowledged instead of exhausting Queue retries",
  );
}

async function testScheduledSourceDeletionRecovery({ client, env, worker }) {
  const upload = await uploadTextFixture(
    client,
    "fixture-scheduled-source-delete.txt",
    "Scheduled source recovery,5.00015",
  );
  await env.DB.prepare(
    "UPDATE source_files SET deletion_started_at = ?, deletion_started_by = ? WHERE id = ?",
  )
    .bind("2000-01-01T00:00:00.000Z", "interrupted-delete", upload.sourceFileId)
    .run();

  await worker.scheduled({}, env);

  const source = await env.DB.prepare(
    "SELECT deleted_at, deletion_started_at FROM source_files WHERE id = ?",
  )
    .bind(upload.sourceFileId)
    .first();
  assert(
    source.deleted_at !== null &&
      source.deletion_started_at === null &&
      (await readJob(env, upload.importJobId))?.status === "voided",
    "scheduled recovery finishes a stale deletion claim without an import Queue delivery",
  );
}

async function testStaleDispatchClaimRecovery({ client, env, worker }) {
  const upload = await uploadTextFixture(
    client,
    "fixture-stale-dispatch-claim.txt",
    "Stale dispatch claim,5.000",
  );
  await env.DB.prepare(
    `
      UPDATE import_jobs
      SET
        mutation_token = 'abandoned-retry',
        mutation_started_at = ?,
        mutation_kind = 'retry',
        mutation_previous_status = 'queued'
      WHERE id = ?
    `,
  )
    .bind(new Date().toISOString(), upload.importJobId)
    .run();
  let retryOptions = null;
  await worker.queue(
    {
      messages: [
        {
          body: queueMessageForJob(env, upload.importJobId),
          retry(options) {
            retryOptions = options;
          },
        },
      ],
    },
    env,
  );
  assert(
    (await readJob(env, upload.importJobId))?.status === "queued" &&
      Number(retryOptions?.delaySeconds ?? 0) >= 30,
    "Queue retries beyond a fresh dispatch claim instead of acknowledging it",
  );

  await env.DB.prepare("UPDATE import_jobs SET mutation_started_at = ? WHERE id = ?")
    .bind("2000-01-01T00:00:00.000Z", upload.importJobId)
    .run();
  await worker.queue(
    { messages: [{ body: queueMessageForJob(env, upload.importJobId), retry() {} }] },
    env,
  );
  const recovered = await env.DB.prepare(
    "SELECT status, attempt_count, mutation_token FROM import_jobs WHERE id = ?",
  )
    .bind(upload.importJobId)
    .first();
  assert(
    recovered.status === "needs_review" &&
      recovered.attempt_count === 1 &&
      recovered.mutation_token === null &&
      (await countRows(env, "import_job_events", "import_job_id", upload.importJobId, {
        extraWhere: "event_type = 'import_job.dispatch_claim_reclaimed'",
      })) === 1,
    "stale dispatch claim is reclaimed once before Queue processing",
  );
}

async function testProcessingClaimUsesUniqueOwner({
  client,
  env,
  markImportJobProcessingStarted,
  worker,
}) {
  const upload = await uploadTextFixture(client, "fixture-owner-fence.txt", "Owner fence,5.001");
  const startedAt = new Date().toISOString();
  const claimInput = {
    adapterId: "starter.import-review",
    jobId: upload.importJobId,
    mode: "queue",
    objectKey: upload.objectKey,
    previousProcessingStartedAt: null,
    sourceFileId: upload.sourceFileId,
    startedAt,
    statusFrom: "queued",
  };
  const claims = await Promise.all([
    markImportJobProcessingStarted(env, claimInput),
    markImportJobProcessingStarted(env, claimInput),
  ]);
  assert(
    claims.filter((claim) => claim.claimed).length === 1,
    "same-millisecond processing claims have one UUID-fenced winner",
  );
  assert(
    (await countRows(env, "import_job_events", "import_job_id", upload.importJobId, {
      extraWhere: "event_type = 'import_job.processing_started'",
    })) === 1,
    "lost same-millisecond processing CAS writes no duplicate event evidence",
  );

  await env.DB.prepare("UPDATE import_jobs SET processing_lease_expires_at = ? WHERE id = ?")
    .bind("2000-01-01T00:00:00.000Z", upload.importJobId)
    .run();
  await worker.queue({ messages: [{ body: queueMessageForJob(env, upload.importJobId) }] }, env);
  assert(
    (await readJob(env, upload.importJobId))?.status === "needs_review",
    "Queue safely takes over the abandoned owner-fenced attempt",
  );
}

async function testVoidUsesClaimAndUniqueEvidence({ client, env, voidImportJob }) {
  const actor = await env.DB.prepare(
    "SELECT id FROM users ORDER BY created_at ASC LIMIT 1",
  ).first();
  assert(actor?.id, "void race coverage has an existing user actor");
  const duplicateUpload = await uploadTextFixture(
    client,
    "fixture-void-operation-token.txt",
    "Void operation token,5.002",
  );
  const voidedAt = new Date().toISOString();
  const input = {
    actorUserId: actor.id,
    importJobId: duplicateUpload.importJobId,
    note: "one operation",
    reason: "race_test",
    sourceFileId: duplicateUpload.sourceFileId,
    statusFrom: "queued",
    voidedAt,
  };
  const results = await Promise.all([voidImportJob(env, input), voidImportJob(env, input)]);
  assert(
    results.filter(Boolean).length === 1,
    "same-timestamp void requests have one operation-token winner",
  );
  assert(
    (await countRows(env, "import_review_decisions", "import_job_id", duplicateUpload.importJobId, {
      extraWhere: "action = 'void'",
    })) === 1 &&
      (await countRows(env, "import_job_events", "import_job_id", duplicateUpload.importJobId, {
        extraWhere: "event_type = 'import_job.voided'",
      })) === 1,
    "lost void CAS writes no duplicate ledger or event evidence",
  );

  const staleUpload = await uploadTextFixture(
    client,
    "fixture-stale-void-claim.txt",
    "Stale void claim,5.003",
  );
  await env.DB.prepare(
    `
      UPDATE import_jobs
      SET mutation_token = ?, mutation_started_at = ?, mutation_kind = 'confirm_pending'
      WHERE id = ?
    `,
  )
    .bind("fresh-void-claim", new Date().toISOString(), staleUpload.importJobId)
    .run();
  const freshDenied = await client.request(`/api/import-jobs/${staleUpload.importJobId}/void`, {
    method: "POST",
  });
  assert(freshDenied.status === 409, "fresh review mutation claim blocks manual void");

  await env.DB.prepare("UPDATE import_jobs SET mutation_started_at = ? WHERE id = ?")
    .bind("2000-01-01T00:00:00.000Z", staleUpload.importJobId)
    .run();
  const staleVoided = await client.json(`/api/import-jobs/${staleUpload.importJobId}/void`, {
    method: "POST",
    body: JSON.stringify({ note: "stale takeover" }),
    headers: jsonHeaders,
  });
  assert(staleVoided.status === "voided", "manual void can take over a stale mutation claim");
  const tombstone = await env.DB.prepare(
    "SELECT mutation_token, mutation_started_at, mutation_kind FROM import_jobs WHERE id = ?",
  )
    .bind(staleUpload.importJobId)
    .first();
  assert(
    tombstone.mutation_token === null &&
      tombstone.mutation_started_at === null &&
      tombstone.mutation_kind === null,
    "void tombstone retains no ghost mutation claim",
  );
}

async function testAutoCommitExcludesManualMutations({
  autoCommitCleanImport,
  client,
  env,
  getImportAdapter,
  worker,
}) {
  const upload = await uploadJsonFixture(client, "fixture-auto-mutation-lock.json", {
    autoLock: 5.004,
  });
  await worker.queue({ messages: [{ body: queueMessageForJob(env, upload.importJobId) }] }, env);
  const review = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  const record = review.records[0];
  const adapter = getImportAdapter("starter.json-records");
  assert(adapter && record, "auto mutation race has an adapter and staged record");

  const originalAutoCommit = adapter.autoCommitCleanImports;
  const originalReadPending = adapter.reviewStore.readPendingStagedRecords;
  const pendingReadEntered = deferred();
  const releasePendingRead = deferred();
  adapter.autoCommitCleanImports = true;
  adapter.reviewStore.readPendingStagedRecords = async (...args) => {
    pendingReadEntered.resolve();
    await releasePendingRead.promise;
    return originalReadPending(...args);
  };

  const automatic = autoCommitCleanImport(env, {
    adapter,
    importJobId: upload.importJobId,
  });
  await pendingReadEntered.promise;
  const reject = await client.request(
    `/api/import-jobs/${upload.importJobId}/staged-records/${record.id}/reject`,
    { method: "POST", body: "{}", headers: jsonHeaders },
  );
  const adjust = await client.request(
    `/api/import-jobs/${upload.importJobId}/staged-records/${record.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ payload: { blocked: true } }),
      headers: jsonHeaders,
    },
  );
  const voided = await client.request(`/api/import-jobs/${upload.importJobId}/void`, {
    method: "POST",
  });
  const adminClient = await createAdminClient(worker, env);
  const deleted = await adminClient.request(`/api/source-files/${upload.sourceFileId}`, {
    method: "DELETE",
  });
  assert(
    reject.status === 409 &&
      adjust.status === 409 &&
      voided.status === 409 &&
      deleted.status === 409,
    "fresh auto-commit claim excludes reject, adjustment, void, and source deletion",
  );

  releasePendingRead.resolve();
  try {
    assert((await automatic) === true, "auto commit completes after excluded mutations");
  } finally {
    adapter.reviewStore.readPendingStagedRecords = originalReadPending;
    adapter.autoCommitCleanImports = originalAutoCommit;
  }
  assert(
    (await readJob(env, upload.importJobId))?.status === "committed" &&
      (await countRows(env, "example_committed_records", "import_job_id", upload.importJobId)) ===
        1,
    "auto commit writes one app row under its mutation claim",
  );
}

async function testManualCommitClaimLossAndStaleResume({ client, env, getImportAdapter, worker }) {
  const upload = await uploadJsonFixture(client, "fixture-manual-commit-resume.json", {
    manualResume: 5.005,
  });
  await worker.queue({ messages: [{ body: queueMessageForJob(env, upload.importJobId) }] }, env);
  const review = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
  const record = review.records[0];
  assert(record, "manual commit recovery has a staged record");
  await client.json(`/api/import-jobs/${upload.importJobId}/staged-records/${record.id}/approve`, {
    method: "POST",
    body: "{}",
    headers: jsonHeaders,
  });

  const adapter = getImportAdapter("starter.json-records");
  assert(adapter, "manual commit recovery has the JSON adapter");
  const originalCommitApproved = adapter.commitApproved;
  const commitEntered = deferred();
  const releaseCommit = deferred();
  adapter.commitApproved = async (...args) => {
    commitEntered.resolve();
    await releaseCommit.promise;
    return originalCommitApproved(...args);
  };

  const firstCommit = client.request(`/api/import-jobs/${upload.importJobId}/commit`, {
    method: "POST",
  });
  await commitEntered.promise;
  const freshDuplicate = await client.request(`/api/import-jobs/${upload.importJobId}/commit`, {
    method: "POST",
  });
  const adminClient = await createAdminClient(worker, env);
  const deleteDuringCommit = await adminClient.request(`/api/source-files/${upload.sourceFileId}`, {
    method: "DELETE",
  });
  assert(
    freshDuplicate.status === 409 && deleteDuringCommit.status === 409,
    "fresh manual commit claim blocks duplicate commit and source deletion",
  );

  await env.DB.prepare("UPDATE import_jobs SET mutation_token = ? WHERE id = ?")
    .bind("stolen-manual-commit", upload.importJobId)
    .run();
  releaseCommit.resolve();
  const firstResponse = await firstCommit;
  adapter.commitApproved = originalCommitApproved;
  assert(firstResponse.status === 409, "lost manual commit claim returns a conflict");
  assert(
    (await countRows(env, "example_committed_records", "import_job_id", upload.importJobId)) === 0,
    "lost commit claim writes no app rows",
  );

  await env.DB.prepare(
    "UPDATE import_jobs SET mutation_started_at = ?, mutation_kind = 'auto_commit' WHERE id = ?",
  )
    .bind("2000-01-01T00:00:00.000Z", upload.importJobId)
    .run();
  const crossKind = await client.request(`/api/import-jobs/${upload.importJobId}/commit`, {
    method: "POST",
  });
  assert(crossKind.status === 409, "manual commit cannot reclaim stale auto-commit claim");

  await env.DB.prepare("UPDATE import_jobs SET mutation_kind = 'commit' WHERE id = ?")
    .bind(upload.importJobId)
    .run();
  const recovered = await client.json(`/api/import-jobs/${upload.importJobId}/commit`, {
    method: "POST",
  });
  const committed = await env.DB.prepare(
    "SELECT id FROM example_committed_records WHERE import_job_id = ?",
  )
    .bind(upload.importJobId)
    .all();
  assert(
    recovered.status === "committed" &&
      committed.results.length === 1 &&
      committed.results[0].id === `committed:${upload.importJobId}:${record.stagedRecordKey}`,
    "stale same-kind manual commit resumes once with a stable committed-record id",
  );
}

async function uploadTextFixture(client, filename, row) {
  return client.json("/api/source-files", {
    method: "POST",
    body: `label,value\n${row}\n`,
    headers: {
      "content-type": "text/plain",
      "x-disable-fast-import": "1",
      "x-filename": filename,
      "x-workspace-id": "default",
    },
  });
}

async function uploadJsonFixture(client, filename, payload) {
  return client.json("/api/source-files", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      ...jsonHeaders,
      "x-disable-fast-import": "1",
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
    "SELECT id, status, mutation_token, mutation_kind FROM import_jobs WHERE id = ? LIMIT 1",
  )
    .bind(jobId)
    .first();
}

async function countRows(env, table, column, value, { extraWhere } = {}) {
  const query = `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?${extraWhere ? ` AND ${extraWhere}` : ""}`;
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

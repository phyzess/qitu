import { assert, createClient, expectApiError } from "./worker-integration-http.mjs";

const jsonHeaders = { "content-type": "application/json" };

export async function testSourceLifecycle({ client, env, getImportAdapter, worker }) {
  await testConcurrentIdenticalIntake({ client, env });
  const lifecycleBody = `label,value\n${"Preview".repeat(10_000)},1\n`;
  const lifecycleUpload = await client.json("/api/source-files", {
    method: "POST",
    body: lifecycleBody,
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture source (final)'s.txt",
      "x-workspace-id": "default",
    },
  });

  const previewResponse = await client.request(
    `/api/source-files/${lifecycleUpload.sourceFileId}/preview`,
  );
  const preview = await previewResponse.json();
  assert(preview.truncated === true, "source preview is bounded and reports truncation");
  assert(preview.maxBytes === 64 * 1024, "source preview exposes its byte bound");

  const downloadResponse = await client.request(
    `/api/source-files/${lifecycleUpload.sourceFileId}/download`,
  );
  assert(downloadResponse.status === 200, "authorized raw source download succeeds");
  assert(
    (await downloadResponse.text()) === lifecycleBody,
    "source download streams the original object",
  );
  assert(
    downloadResponse.headers.get("content-disposition")?.includes("%28final%29%27s.txt"),
    "source download percent-encodes RFC 5987 punctuation",
  );
  assert(
    downloadResponse.headers.get("cache-control") === "private, no-store" &&
      previewResponse.headers.get("cache-control") === "private, no-store" &&
      previewResponse.headers.get("x-content-type-options") === "nosniff",
    "raw source responses are not browser-cacheable",
  );
  for (const action of ["source_file.previewed", "source_file.downloaded"]) {
    const audit = await env.DB.prepare(
      "SELECT action FROM audit_events WHERE action = ? AND subject_id = ? LIMIT 1",
    )
      .bind(action, lifecycleUpload.sourceFileId)
      .first();
    assert(audit?.action === action, `${action} records raw-access audit evidence`);
  }

  const reparse = await client.json(`/api/source-files/${lifecycleUpload.sourceFileId}/reparse`, {
    method: "POST",
  });
  assert(reparse.status === "queued", "source reparse creates a new queued import job");
  const voided = await client.json(`/api/import-jobs/${reparse.importJobId}/void`, {
    method: "POST",
  });
  assert(voided.status === "voided", "queued reparse jobs can be voided");
  const duplicateVoid = await client.json(`/api/import-jobs/${reparse.importJobId}/void`, {
    method: "POST",
  });
  assert(duplicateVoid.duplicate === true, "repeating a void action is idempotent");

  const activeReparse = await client.json(
    `/api/source-files/${lifecycleUpload.sourceFileId}/reparse`,
    { method: "POST" },
  );
  await env.DB.prepare("UPDATE import_jobs SET created_at = ? WHERE source_file_id = ?")
    .bind("2026-07-10T00:00:00.000Z", lifecycleUpload.sourceFileId)
    .run();
  await env.DB.prepare("UPDATE import_jobs SET status = 'processing' WHERE id = ?")
    .bind(activeReparse.importJobId)
    .run();
  const latestDuplicate = await client.json("/api/source-files", {
    method: "POST",
    body: lifecycleBody,
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture-latest-duplicate.txt",
      "x-workspace-id": "default",
    },
  });
  assert(
    latestDuplicate.duplicate === true && latestDuplicate.importJobId === activeReparse.importJobId,
    "duplicate intake deterministically returns the source's latest reparse job",
  );
  await expectApiError(
    await client.request(`/api/import-jobs/${activeReparse.importJobId}/void`, {
      method: "POST",
    }),
    409,
    "import_job_processing",
  );

  const adjustmentUpload = await client.json("/api/source-files", {
    method: "POST",
    body: JSON.stringify([{ key: " ", value: 7 }]),
    headers: {
      ...jsonHeaders,
      "x-filename": "fixture-staged-adjustment.json",
      "x-workspace-id": "default",
    },
  });
  const adjustmentMessage = env.IMPORT_JOBS.messages.at(-1);
  await worker.queue({ messages: [{ body: adjustmentMessage }] }, env);
  const adjustmentReview = await client.json(
    `/api/import-jobs/${adjustmentUpload.importJobId}/review`,
  );
  const adjusted = await client.json(
    `/api/import-jobs/${adjustmentUpload.importJobId}/staged-records/${adjustmentReview.records[0].id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        note: "correct the staged key",
        payload: {
          key: "Corrected",
          value: 7,
          sourcePath: "$[0]",
          normalizedKey: "corrected",
          valueType: "number",
        },
      }),
      headers: jsonHeaders,
    },
  );
  assert(adjusted.record.reviewStatus === "pending", "adjustment returns the row to pending");
  const adjustedReview = await client.json(
    `/api/import-jobs/${adjustmentUpload.importJobId}/review`,
  );
  assert(
    adjustedReview.issues.some(
      (issue) => issue.code === "empty_key" && issue.status === "superseded",
    ),
    "adjustment preserves the previous validation issue as superseded evidence",
  );
  const adjustmentAudit = await env.DB.prepare(
    "SELECT metadata_json FROM audit_events WHERE action = 'import_review.record_adjusted' AND subject_id = ? ORDER BY occurred_at DESC LIMIT 1",
  )
    .bind(adjustmentReview.records[0].id)
    .first();
  const adjustmentMetadata = JSON.parse(adjustmentAudit.metadata_json);
  assert(
    adjustmentMetadata.previousPayloadHash.length === 64 &&
      adjustmentMetadata.adjustedPayloadHash.length === 64 &&
      adjustmentMetadata.previousPayloadHash !== adjustmentMetadata.adjustedPayloadHash,
    "adjustment audit records distinct before/after payload digests",
  );
  await client.json(
    `/api/import-jobs/${adjustmentUpload.importJobId}/staged-records/${adjustmentReview.records[0].id}/approve`,
    { method: "POST", body: "{}", headers: jsonHeaders },
  );
  const adjustmentCommit = await client.json(
    `/api/import-jobs/${adjustmentUpload.importJobId}/commit`,
    { method: "POST" },
  );
  assert(adjustmentCommit.status === "committed", "adjusted records use the ordinary commit path");
  await expectApiError(
    await client.request(`/api/import-jobs/${adjustmentUpload.importJobId}/void`, {
      method: "POST",
    }),
    409,
    "committed_import_job",
  );

  await expectApiError(
    await client.request(`/api/source-files/${lifecycleUpload.sourceFileId}`, {
      method: "DELETE",
    }),
    403,
    "forbidden",
  );

  const adminClient = createClient(worker, env);
  await adminClient.json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "local-admin@example.com",
      password: "correct horse battery staple",
    }),
    headers: jsonHeaders,
  });

  await testReviewStoreCleanupGrouping({ adminClient, client, env, getImportAdapter });
  await testRecoveryMissingCleanupStaysFenced({ adminClient, client, env, getImportAdapter });

  const staleClaimUpload = await client.json("/api/source-files", {
    method: "POST",
    body: "label,value\nStale claim,2\n",
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture-stale-source-delete.txt",
      "x-workspace-id": "default",
    },
  });
  await env.DB.prepare(
    "UPDATE source_files SET deletion_started_at = ?, deletion_started_by = ? WHERE id = ?",
  )
    .bind("2000-01-01T00:00:00.000Z", "interrupted-operator", staleClaimUpload.sourceFileId)
    .run();
  env.DB.beforeRun = async ({ params }) => {
    if (params[1] !== "source_file.deletion_reclaimed") return;
    env.DB.beforeRun = null;
    throw new Error("simulated reclaim audit failure");
  };
  const failedAtomicReclaim = await adminClient.request(
    `/api/source-files/${staleClaimUpload.sourceFileId}`,
    { method: "DELETE" },
  );
  env.DB.beforeRun = null;
  const claimAfterFailedReclaim = await env.DB.prepare(
    "SELECT deletion_started_at FROM source_files WHERE id = ?",
  )
    .bind(staleClaimUpload.sourceFileId)
    .first();
  assert(
    failedAtomicReclaim.status === 500 &&
      claimAfterFailedReclaim.deletion_started_at === "2000-01-01T00:00:00.000Z",
    "a failed reclaim audit rolls back the claim takeover",
  );
  const reclaimedDelete = await adminClient.json(
    `/api/source-files/${staleClaimUpload.sourceFileId}`,
    { method: "DELETE" },
  );
  assert(reclaimedDelete.status === "deleted", "a stale deletion claim is safely reclaimed");
  const reclaimAudit = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'source_file.deletion_reclaimed' AND subject_id = ?",
  )
    .bind(staleClaimUpload.sourceFileId)
    .first();
  assert(Number(reclaimAudit.count) === 1, "stale deletion takeover is audited");

  const concurrentBody = "label,value\nConcurrent,3\n";
  const concurrentUpload = await client.json("/api/source-files", {
    method: "POST",
    body: concurrentBody,
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture-concurrent-source-delete.txt",
      "x-workspace-id": "default",
    },
  });
  const activeDuplicate = await client.json("/api/source-files", {
    method: "POST",
    body: concurrentBody,
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture-concurrent-source-duplicate.txt",
      "x-workspace-id": "default",
    },
  });
  assert(
    activeDuplicate.duplicate === true &&
      activeDuplicate.sourceFileId === concurrentUpload.sourceFileId,
    "active identical source intake remains idempotent",
  );
  const originalDelete = env.SOURCE_FILES.delete.bind(env.SOURCE_FILES);
  let enterConcurrentDelete;
  let releaseConcurrentDelete;
  const concurrentDeleteEntered = new Promise((resolve) => {
    enterConcurrentDelete = resolve;
  });
  const concurrentDeleteRelease = new Promise((resolve) => {
    releaseConcurrentDelete = resolve;
  });
  env.SOURCE_FILES.delete = async (objectKey) => {
    if (objectKey === concurrentUpload.objectKey) {
      enterConcurrentDelete();
      await concurrentDeleteRelease;
    }
    await originalDelete(objectKey);
  };

  const firstConcurrentDelete = adminClient.request(
    `/api/source-files/${concurrentUpload.sourceFileId}`,
    { method: "DELETE" },
  );
  await concurrentDeleteEntered;
  await expectApiError(
    await adminClient.request(`/api/source-files/${concurrentUpload.sourceFileId}`, {
      method: "DELETE",
    }),
    409,
    "source_deletion_in_progress",
  );
  await expectApiError(
    await client.request(`/api/source-files/${concurrentUpload.sourceFileId}/reparse`, {
      method: "POST",
    }),
    409,
    "source_deletion_in_progress",
  );
  await expectApiError(
    await client.request("/api/source-files", {
      method: "POST",
      body: concurrentBody,
      headers: {
        "content-type": "text/plain",
        "x-filename": "fixture-upload-during-delete.txt",
        "x-workspace-id": "default",
      },
    }),
    409,
    "source_deletion_in_progress",
  );
  releaseConcurrentDelete();
  const firstConcurrentDeleteResponse = await firstConcurrentDelete;
  assert(firstConcurrentDeleteResponse.status === 200, "the deletion claim owner completes");
  env.SOURCE_FILES.delete = originalDelete;
  const replacementConcurrent = await client.json("/api/source-files", {
    method: "POST",
    body: concurrentBody,
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture-upload-after-delete.txt",
      "x-workspace-id": "default",
    },
  });
  assert(
    replacementConcurrent.sourceFileId !== concurrentUpload.sourceFileId &&
      replacementConcurrent.duplicate !== true,
    "identical content can create a new source after the prior source is tombstoned",
  );
  const concurrentDeleteAudits = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'source_file.deleted' AND subject_id = ?",
  )
    .bind(concurrentUpload.sourceFileId)
    .first();
  assert(
    Number(concurrentDeleteAudits.count) === 1,
    "concurrent source deletion writes one success audit",
  );

  const fencedUpload = await client.json("/api/source-files", {
    method: "POST",
    body: "label,value\nFenced delete,3.5\n",
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture-fenced-source-delete.txt",
      "x-workspace-id": "default",
    },
  });
  let fencedRenewalCount = 0;
  let fencedR2DeleteCalls = 0;
  env.DB.beforeRun = async ({ sql }) => {
    if (!sql.includes("renew_source_deletion_claim")) return;
    fencedRenewalCount += 1;
    if (fencedRenewalCount !== 2) return;
    env.DB.beforeRun = null;
    env.DB.database
      .prepare(
        "UPDATE source_files SET deletion_started_at = ?, deletion_started_by = ? WHERE id = ?",
      )
      .run("2099-01-01T00:00:00.000Z", "replacement-delete-owner", fencedUpload.sourceFileId);
  };
  env.SOURCE_FILES.delete = async (objectKey) => {
    if (objectKey === fencedUpload.objectKey) {
      fencedR2DeleteCalls += 1;
    }
    await originalDelete(objectKey);
  };
  await expectApiError(
    await adminClient.request(`/api/source-files/${fencedUpload.sourceFileId}`, {
      method: "DELETE",
    }),
    409,
    "source_deletion_in_progress",
  );
  env.DB.beforeRun = null;
  env.SOURCE_FILES.delete = originalDelete;
  const staleOwnerEvidence = await env.DB.prepare(
    `
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE subject_id = ? AND action IN ('source_file.deleted', 'source_file.delete_failed')
    `,
  )
    .bind(fencedUpload.sourceFileId)
    .first();
  assert(
    Number(staleOwnerEvidence.count) === 0 &&
      fencedR2DeleteCalls === 0 &&
      env.SOURCE_FILES.has(fencedUpload.objectKey),
    "a stale deletion owner is fenced before the R2 side effect and writes no evidence",
  );
  await env.DB.prepare(
    "UPDATE source_files SET deletion_started_at = ?, deletion_started_by = ? WHERE id = ?",
  )
    .bind("2000-01-01T00:00:00.000Z", "replacement-delete-owner", fencedUpload.sourceFileId)
    .run();
  const fencedRecovery = await adminClient.json(`/api/source-files/${fencedUpload.sourceFileId}`, {
    method: "DELETE",
  });
  assert(fencedRecovery.status === "deleted", "replacement deletion owner finishes cleanup");
  const fencedSuccessEvidence = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'source_file.deleted' AND subject_id = ?",
  )
    .bind(fencedUpload.sourceFileId)
    .first();
  assert(
    Number(fencedSuccessEvidence.count) === 1,
    "replacement deletion owner writes one success evidence set",
  );

  const retryableUpload = await client.json("/api/source-files", {
    method: "POST",
    body: "label,value\nRetryable,4\n",
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture-retryable-source-delete.txt",
      "x-workspace-id": "default",
    },
  });
  env.SOURCE_FILES.delete = async (objectKey) => {
    if (objectKey === retryableUpload.objectKey) {
      throw new Error("simulated R2 delete failure");
    }
    await originalDelete(objectKey);
  };
  await expectApiError(
    await adminClient.request(`/api/source-files/${retryableUpload.sourceFileId}`, {
      method: "DELETE",
    }),
    502,
    "source_delete_failed",
  );
  const retryableSource = await env.DB.prepare(
    "SELECT deleted_at, deletion_started_at, deletion_failure_stage FROM source_files WHERE id = ?",
  )
    .bind(retryableUpload.sourceFileId)
    .first();
  assert(
    retryableSource.deleted_at === null &&
      retryableSource.deletion_started_at !== null &&
      retryableSource.deletion_failure_stage === "r2_delete",
    "failed R2 deletion stays fail-closed and records the retry stage",
  );
  await worker.scheduled({}, env);
  await worker.scheduled({}, env);
  env.SOURCE_FILES.delete = originalDelete;
  const stalledAlerts = await env.DB.prepare(
    `
      SELECT COUNT(*) AS count
      FROM alert_events
      WHERE alert_type = 'source_file.deletion_stalled'
        AND entity_id = ?
        AND status = 'open'
    `,
  )
    .bind(retryableUpload.sourceFileId)
    .first();
  assert(
    Number(stalledAlerts.count) === 1,
    "repeated scheduled recovery failures keep one open source-deletion alert",
  );
  const retryableDeleted = await adminClient.json(
    `/api/source-files/${retryableUpload.sourceFileId}`,
    { method: "DELETE" },
  );
  assert(retryableDeleted.status === "deleted", "failed source deletion can be retried");
  const resolvedStalledAlert = await env.DB.prepare(
    `
      SELECT status
      FROM alert_events
      WHERE alert_type = 'source_file.deletion_stalled' AND entity_id = ?
      LIMIT 1
    `,
  )
    .bind(retryableUpload.sourceFileId)
    .first();
  assert(
    resolvedStalledAlert.status === "resolved",
    "successful source-deletion recovery resolves its stalled alert",
  );

  const cleanupFailureUpload = await client.json("/api/source-files", {
    method: "POST",
    body: JSON.stringify([{ key: "cleanup-rollback", value: 5 }]),
    headers: {
      ...jsonHeaders,
      "x-filename": "fixture-cleanup-rollback.json",
      "x-workspace-id": "default",
    },
  });
  const cleanupFailureMessage = env.IMPORT_JOBS.messages.at(-1);
  await worker.queue({ messages: [{ body: cleanupFailureMessage }] }, env);
  env.DB.beforeRun = async ({ sql }) => {
    if (!sql.includes("deletion_started_at = NULL") || !sql.includes("deleted_at = ?")) return;
    env.DB.beforeRun = null;
    throw new Error("simulated D1 cleanup failure");
  };
  await expectApiError(
    await adminClient.request(`/api/source-files/${cleanupFailureUpload.sourceFileId}`, {
      method: "DELETE",
    }),
    502,
    "source_delete_failed",
  );
  env.DB.beforeRun = null;
  const stagedAfterCleanupFailure = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM example_staged_records WHERE source_file_id = ?",
  )
    .bind(cleanupFailureUpload.sourceFileId)
    .first();
  const cleanupFailureSource = await env.DB.prepare(
    "SELECT deleted_at, deletion_started_at, deletion_failure_stage FROM source_files WHERE id = ?",
  )
    .bind(cleanupFailureUpload.sourceFileId)
    .first();
  assert(
    Number(stagedAfterCleanupFailure.count) > 0 &&
      cleanupFailureSource.deleted_at === null &&
      cleanupFailureSource.deletion_started_at !== null &&
      cleanupFailureSource.deletion_failure_stage === "d1_cleanup",
    "failed D1 cleanup rolls back feature deletion and keeps a fail-closed recovery claim",
  );
  await expectApiError(
    await client.request(`/api/source-files/${cleanupFailureUpload.sourceFileId}/preview`),
    409,
    "source_deletion_in_progress",
  );
  await expectApiError(
    await client.request(`/api/source-files/${cleanupFailureUpload.sourceFileId}/reparse`, {
      method: "POST",
    }),
    409,
    "source_deletion_in_progress",
  );
  await expectApiError(
    await client.request("/api/source-files", {
      method: "POST",
      body: JSON.stringify([{ key: "cleanup-rollback", value: 5 }]),
      headers: {
        ...jsonHeaders,
        "x-filename": "fixture-cleanup-rollback-duplicate.json",
        "x-workspace-id": "default",
      },
    }),
    409,
    "source_deletion_in_progress",
  );
  const cleanupFailureRetry = await adminClient.json(
    `/api/source-files/${cleanupFailureUpload.sourceFileId}`,
    { method: "DELETE" },
  );
  assert(
    cleanupFailureRetry.status === "deleted",
    "D1 cleanup failure can be retried idempotently",
  );

  env.SOURCE_FILES.delete = async (objectKey) => {
    const source = await env.DB.prepare(
      "SELECT id, deleted_at FROM source_files WHERE object_key = ? LIMIT 1",
    )
      .bind(objectKey)
      .first();
    const jobs = await env.DB.prepare("SELECT status FROM import_jobs WHERE source_file_id = ?")
      .bind(source.id)
      .all();
    assert(
      jobs.results.every((job) => job.status === "voided"),
      "all source jobs are voided before the R2 delete",
    );
    assert(source.deleted_at === null, "R2 is deleted before the D1 report-only tombstone");
    await originalDelete(objectKey);
  };

  const deleted = await adminClient.json("/api/source-files/delete", {
    method: "POST",
    body: JSON.stringify({
      sourceFileIds: [lifecycleUpload.sourceFileId, adjustmentUpload.sourceFileId],
    }),
    headers: jsonHeaders,
  });
  env.SOURCE_FILES.delete = originalDelete;
  assert(
    deleted.results.every(
      (result) => result.status === "deleted" && result.retention === "report_only",
    ),
    "batch deletion returns report-only tombstones",
  );
  assert(
    !env.SOURCE_FILES.has(lifecycleUpload.objectKey) &&
      !env.SOURCE_FILES.has(adjustmentUpload.objectKey),
    "source deletion removes raw R2 objects",
  );

  const duplicateDelete = await adminClient.json(
    `/api/source-files/${lifecycleUpload.sourceFileId}`,
    { method: "DELETE" },
  );
  assert(duplicateDelete.status === "already_deleted", "source deletion is idempotent");
  await expectApiError(
    await client.request(`/api/source-files/${lifecycleUpload.sourceFileId}/preview`),
    410,
    "source_file_report_only",
  );

  const tombstones = await env.DB.prepare(
    "SELECT id, deleted_at, deleted_by FROM source_files WHERE id IN (?, ?)",
  )
    .bind(lifecycleUpload.sourceFileId, adjustmentUpload.sourceFileId)
    .all();
  assert(
    tombstones.results.every((row) => row.deleted_at && row.deleted_by),
    "D1 retains report-only source metadata with deletion identity",
  );
  const tombstoneJobs = await env.DB.prepare(
    `
      SELECT mutation_token, mutation_started_at, mutation_kind, processing_owner
      FROM import_jobs
      WHERE source_file_id IN (?, ?)
    `,
  )
    .bind(lifecycleUpload.sourceFileId, adjustmentUpload.sourceFileId)
    .all();
  assert(
    tombstoneJobs.results.every(
      (row) =>
        row.mutation_token === null &&
        row.mutation_started_at === null &&
        row.mutation_kind === null &&
        row.processing_owner === null,
    ),
    "report-only jobs retain no processing or mutation claims",
  );
  const featureRows = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM example_staged_records WHERE source_file_id = ?",
  )
    .bind(adjustmentUpload.sourceFileId)
    .first();
  const committedRows = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM example_committed_records WHERE source_file_id = ?",
  )
    .bind(adjustmentUpload.sourceFileId)
    .first();
  assert(
    Number(featureRows?.count ?? 0) === 0 && Number(committedRows?.count ?? 0) === 0,
    "app-owned review-store cleanup removes staged and committed feature data",
  );

  const sourceDeleteAudits = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'source_file.deleted' AND subject_id = ?",
  )
    .bind(lifecycleUpload.sourceFileId)
    .first();
  assert(Number(sourceDeleteAudits?.count ?? 0) === 1, "source deletion audit is idempotent");
  const retainedEvents = await client.json(`/api/import-jobs/${reparse.importJobId}/events`);
  assert(
    retainedEvents.events.some((event) => event.eventType === "source_file.deleted"),
    "report-only import job events retain source deletion evidence",
  );

  const sourceFiles = await client.json("/api/source-files");
  const activeSourceIds = new Set(sourceFiles.sourceFiles.map((source) => source.id));
  assert(
    !activeSourceIds.has(lifecycleUpload.sourceFileId) &&
      !activeSourceIds.has(adjustmentUpload.sourceFileId) &&
      !activeSourceIds.has(staleClaimUpload.sourceFileId) &&
      !activeSourceIds.has(concurrentUpload.sourceFileId) &&
      !activeSourceIds.has(fencedUpload.sourceFileId) &&
      !activeSourceIds.has(retryableUpload.sourceFileId) &&
      !activeSourceIds.has(cleanupFailureUpload.sourceFileId),
    "deleted report-only sources leave the active list",
  );
}

async function testReviewStoreCleanupGrouping({ adminClient, client, env, getImportAdapter }) {
  const upload = await client.json("/api/source-files", {
    method: "POST",
    body: JSON.stringify([{ key: "store-group", value: 6 }]),
    headers: {
      ...jsonHeaders,
      "x-filename": "fixture-store-cleanup-grouping.json",
      "x-workspace-id": "default",
    },
  });
  const reparse = await client.json(`/api/source-files/${upload.sourceFileId}/reparse`, {
    method: "POST",
  });
  await env.DB.prepare("UPDATE import_jobs SET adapter_id = ? WHERE id = ?")
    .bind("starter.import-review", upload.importJobId)
    .run();

  const textAdapter = getImportAdapter("starter.import-review");
  const jsonAdapter = getImportAdapter("starter.json-records");
  const originalTextStore = textAdapter.reviewStore;
  const originalJsonStore = jsonAdapter.reviewStore;
  const cleanupCalls = [];
  textAdapter.reviewStore = {
    ...originalTextStore,
    prepareDeleteSourceRecords(cleanupEnv, input) {
      cleanupCalls.push({ importJobIds: input.importJobIds, store: "text" });
      return originalTextStore.prepareDeleteSourceRecords(cleanupEnv, input);
    },
  };
  jsonAdapter.reviewStore = {
    ...originalJsonStore,
    prepareDeleteSourceRecords(cleanupEnv, input) {
      cleanupCalls.push({ importJobIds: input.importJobIds, store: "json" });
      return originalJsonStore.prepareDeleteSourceRecords(cleanupEnv, input);
    },
  };

  try {
    const deleted = await adminClient.json(`/api/source-files/${upload.sourceFileId}`, {
      method: "DELETE",
    });
    assert(deleted.status === "deleted", "source with multiple review stores can be deleted");
  } finally {
    textAdapter.reviewStore = originalTextStore;
    jsonAdapter.reviewStore = originalJsonStore;
  }

  const textCall = cleanupCalls.find((call) => call.store === "text");
  const jsonCall = cleanupCalls.find((call) => call.store === "json");
  assert(
    cleanupCalls.length === 2 &&
      textCall.importJobIds.length === 1 &&
      textCall.importJobIds[0] === upload.importJobId &&
      jsonCall.importJobIds.length === 1 &&
      jsonCall.importJobIds[0] === reparse.importJobId,
    "each review store receives only the import job IDs that belong to it",
  );
}

async function testRecoveryMissingCleanupStaysFenced({
  adminClient,
  client,
  env,
  getImportAdapter,
}) {
  const upload = await client.json("/api/source-files", {
    method: "POST",
    body: "label,value\nMissing cleanup recovery,6.5\n",
    headers: {
      "content-type": "text/plain",
      "x-filename": "fixture-recovery-missing-cleanup.txt",
      "x-workspace-id": "default",
    },
  });
  await env.SOURCE_FILES.delete(upload.objectKey);
  await env.DB.prepare(
    `
      UPDATE source_files
      SET
        deletion_started_at = '2000-01-01T00:00:00.000Z',
        deletion_started_by = 'interrupted-delete',
        deletion_failure_stage = 'd1_cleanup',
        deletion_failure_reason = 'simulated interrupted cleanup'
      WHERE id = ?
    `,
  )
    .bind(upload.sourceFileId)
    .run();

  const adapter = getImportAdapter("starter.import-review");
  const originalStore = adapter.reviewStore;
  adapter.reviewStore = {
    ...originalStore,
    prepareDeleteSourceRecords: undefined,
  };
  try {
    await expectApiError(
      await adminClient.request(`/api/source-files/${upload.sourceFileId}`, {
        method: "DELETE",
      }),
      409,
      "source_cleanup_not_supported",
    );
  } finally {
    adapter.reviewStore = originalStore;
  }

  const blocked = await env.DB.prepare(
    `
      SELECT deletion_started_at, deletion_failure_stage
      FROM source_files
      WHERE id = ?
    `,
  )
    .bind(upload.sourceFileId)
    .first();
  assert(
    blocked.deletion_started_at !== null && blocked.deletion_failure_stage === "cleanup_preflight",
    "missing cleanup support cannot reopen a recovery claim after R2 may be gone",
  );

  const recovered = await adminClient.json(`/api/source-files/${upload.sourceFileId}`, {
    method: "DELETE",
  });
  assert(
    recovered.status === "deleted",
    "a cleanup-blocked recovery can resume immediately after its adapter hook is restored",
  );
}

async function testConcurrentIdenticalIntake({ client, env }) {
  const body = "label,value\nConcurrent intake,0.5\n";
  const originalPut = env.SOURCE_FILES.put.bind(env.SOURCE_FILES);
  const bothPutsEntered = deferred();
  const releasePuts = deferred();
  let putCount = 0;
  env.SOURCE_FILES.put = async (...args) => {
    putCount += 1;
    if (putCount === 2) bothPutsEntered.resolve();
    await releasePuts.promise;
    return originalPut(...args);
  };

  const request = () =>
    client.request("/api/source-files", {
      method: "POST",
      body,
      headers: {
        "content-type": "text/plain",
        "x-disable-fast-import": "1",
        "x-filename": "fixture-concurrent-identical-intake.txt",
        "x-workspace-id": "default",
      },
    });
  const responsesPromise = Promise.all([request(), request()]);
  await bothPutsEntered.promise;
  releasePuts.resolve();
  const responses = await responsesPromise;
  env.SOURCE_FILES.put = originalPut;
  assert(
    responses.every((response) => response.ok) &&
      new Set(responses.map((response) => response.status)).size === 2,
    "concurrent identical uploads return one accepted and one duplicate response",
  );
  const results = await Promise.all(responses.map((response) => response.json()));
  assert(
    results[0].sourceFileId === results[1].sourceFileId &&
      results[0].importJobId === results[1].importJobId &&
      results[0].objectKey === results[1].objectKey,
    "concurrent identical upload loser resolves to the winning source and job",
  );
  const winner = await env.DB.prepare("SELECT content_hash FROM source_files WHERE id = ? LIMIT 1")
    .bind(results[0].sourceFileId)
    .first();
  const sourceCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM source_files WHERE content_hash = ? AND deleted_at IS NULL",
  )
    .bind(winner.content_hash)
    .first();
  const jobCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM import_jobs WHERE source_file_id = ?",
  )
    .bind(results[0].sourceFileId)
    .first();
  const objectCount = [...env.SOURCE_FILES.objects.values()].filter(
    (object) => object.customMetadata?.contentHash === winner.content_hash,
  ).length;
  const queuedCount = env.IMPORT_JOBS.messages.filter(
    (message) => message.jobId === results[0].importJobId,
  ).length;
  assert(
    Number(sourceCount.count) === 1 &&
      Number(jobCount.count) === 1 &&
      objectCount === 1 &&
      queuedCount === 1,
    "concurrent identical uploads persist one source, job, R2 object, and Queue message",
  );
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

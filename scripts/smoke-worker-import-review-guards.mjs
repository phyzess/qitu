export function assertWorkerImportReviewGuards(context) {
  const {
    assert,
    workerImportAdapters,
    workerImportJobRoutes,
    workerImportJobRunner,
    workerImportJobStaging,
    workerImportReviewRoutes,
    workerSources,
    workerStarterReviewSources,
  } = context;

  assert(
    workerImportJobRunner.includes("status = 'processing'") &&
      workerImportJobRunner.includes("mutation_token IS NULL") &&
      workerImportJobRunner.includes("processing_owner = ?") &&
      workerImportJobRunner.includes("processing_lease_expires_at = ?") &&
      workerImportJobStaging.includes("status = 'needs_review'") &&
      workerImportJobRunner.includes("markImportJobFailed"),
    "queue consumer must advance import job state and record failures.",
  );
  assert(
    workerStarterReviewSources.includes("INSERT OR IGNORE INTO example_staged_records") &&
      workerStarterReviewSources.includes("SELECT review_status, COUNT(*) AS count") &&
      workerImportJobStaging.includes("INSERT OR IGNORE INTO import_review_issues") &&
      workerImportJobRunner.includes("attempt_count = COALESCE") &&
      workerImportAdapters.includes("registeredImportAdapters") &&
      workerImportAdapters.includes("starterImportReviewAdapter") &&
      workerImportAdapters.includes("starterJsonRecordsAdapter") &&
      workerImportAdapters.includes("reviewStore") &&
      workerSources.includes("selectImportAdapter") &&
      workerImportJobRunner.includes("adapter.parseAndStage") &&
      workerSources.includes("adapter.commitApproved"),
    "queue consumer must use multiple registered adapters, stage review records idempotently, and count attempts.",
  );
  assert(
    !workerSources.includes("@qitu/example-import-review") &&
      !workerSources.includes("@qitu/example-json-records"),
    "worker source must not import optional example packages.",
  );
  assert(
    workerSources.includes("/api/import-jobs/:jobId/review") &&
      workerImportReviewRoutes.includes("registerImportReviewDetailRoute") &&
      workerImportReviewRoutes.includes("readImportReviewIssues") &&
      workerImportJobRoutes.includes("readImportJobList") &&
      workerImportJobRoutes.includes("publicImportJobListItem") &&
      workerSources.includes("/api/import-jobs/:jobId/events") &&
      workerSources.includes("/api/import-jobs/:jobId/advisories") &&
      workerSources.includes("/api/import-jobs/:jobId/advisories/:advisoryId/confirm") &&
      workerSources.includes("/api/import-jobs/:jobId/advisories/:advisoryId/dismiss") &&
      workerSources.includes("/api/import-jobs/:jobId/staged-records/:recordId/approve") &&
      workerSources.includes("/api/import-jobs/:jobId/staged-records/:recordId/reject") &&
      workerSources.includes("/api/import-jobs/:jobId/commit") &&
      workerSources.includes("/api/import-jobs/:jobId/retry") &&
      workerSources.includes("/api/import-jobs/:jobId/dispatch"),
    "worker must expose review, commit, retry, and queued redispatch routes.",
  );
  assert(
    workerImportJobRoutes.includes("scheduleFastImportProcessing") &&
      workerImportJobRoutes.includes("context.executionCtx.waitUntil") &&
      workerImportJobRoutes.includes('context.req.header("x-disable-fast-import")') &&
      workerImportJobRoutes.includes("readImportJobRedispatchTarget") &&
      workerImportJobRoutes.includes("prepareImportJobRedispatchSucceededStatements") &&
      workerImportJobRoutes.includes('action: "import_job.dispatch_retried"'),
    "HTTP upload and queued redispatch must keep an audited waitUntil fast path beside Queue delivery.",
  );
  assert(
    workerImportJobRoutes.includes("readImportJobRetryTarget") &&
      workerImportJobRoutes.includes("dispatchImportJobRetry") &&
      workerImportJobRoutes.includes("prepareImportJobRetryStatements"),
    "import-job retry routes must keep target preflight, queue dispatch, and retry D1 statements in focused support modules.",
  );
  assert(
    workerSources.includes("prepareImportJobEventInsert") &&
      workerSources.includes("import_job.processing_started") &&
      workerSources.includes("import_job.needs_review") &&
      workerSources.includes("import_job.committed") &&
      workerSources.includes("prepareAlertEventInsert"),
    "worker must write import job timeline events and alert events for failure paths.",
  );
  assert(
    workerSources.includes("INSERT INTO import_review_decisions") &&
      workerSources.includes("INSERT INTO import_review_record_decisions") &&
      workerSources.includes("INSERT INTO example_committed_records"),
    "review and commit routes must write core decisions and example commit records.",
  );
  assert(
    workerSources.includes("export type ImportJobReviewRow") &&
      workerSources.includes('"./import-review-row-types"') &&
      !workerSources.includes('ImportJobReviewRow } from "./import-review-presenters"'),
    "import review D1 row types must stay outside public presenter modules.",
  );
  assert(
    workerSources.includes("/api/dev/import-jobs/drain") &&
      workerSources.includes('processImportJob(context.env, message, { mode: "fast" })') &&
      workerSources.includes('processImportJob(env, body, { mode: "queue" })') &&
      workerSources.includes("message.retry({ delaySeconds: result.retryDelaySeconds })"),
    "Worker must expose a local-only import job drain route that reuses Queue handler logic.",
  );
}

import { assert } from "./worker-integration-http.mjs";
import { testCsvImportReviewScenarios } from "./worker-integration-import-review-csv.mjs";
import { testJsonImportReviewScenario } from "./worker-integration-import-review-json.mjs";
import { testImportCommitPolicies } from "./worker-integration-import-auto-commit.mjs";
import { testOpenErrorOverride } from "./worker-integration-import-review-error-override.mjs";
import { testQueuedImportRedispatch } from "./worker-integration-import-review-redispatch.mjs";
import { testImportRetryScenario } from "./worker-integration-import-review-retry.mjs";
import { testUtf8SourceUploadFilename } from "./worker-integration-upload-filename.mjs";

export async function testImportReviewWorkflow({
  autoCommitCleanImport,
  client,
  env,
  getImportAdapter,
  worker,
}) {
  const { upload } = await testCsvImportReviewScenarios({ client, env, worker });

  await testJsonImportReviewScenario({ client, env, worker });
  await testImportRetryScenario({ client, env, worker });
  await testQueuedImportRedispatch({ client, env });
  await testUtf8SourceUploadFilename({ client, env });
  await testOpenErrorOverride({
    autoCommitCleanImport,
    client,
    env,
    getImportAdapter,
    worker,
  });
  await testImportCommitPolicies({
    autoCommitCleanImport,
    client,
    env,
    getImportAdapter,
    worker,
  });

  const sourceFiles = await client.json("/api/source-files");
  assert(sourceFiles.sourceFiles.length > 0, "source file list is visible");

  const importJobs = await client.json("/api/import-jobs");
  assert(
    importJobs.importJobs.some((job) => job.status === "committed"),
    "import job list reflects commit",
  );

  return { upload };
}

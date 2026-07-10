import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { createTestEnv } from "./worker-integration-env.mjs";
import { createClient } from "./worker-integration-http.mjs";
import { testInboundEmailIntake } from "./worker-integration-inbound-email.mjs";
import { testAuditFilters } from "./worker-integration-audit.mjs";
import { testAuthBootstrapAndMembers } from "./worker-integration-auth.mjs";
import { testImportReviewWorkflow } from "./worker-integration-import-review.mjs";
import { testImportProcessingRaces } from "./worker-integration-import-processing-races.mjs";
import { testImportMutationRaces } from "./worker-integration-import-mutation-races.mjs";
import { testSourceLifecycle } from "./worker-integration-source-lifecycle.mjs";

const root = process.cwd();
const require = createRequire(import.meta.url);
const vitePath = require.resolve("vite", {
  paths: [join(root, "apps", "web")],
});
const { createServer } = await import(pathToFileURL(vitePath));

const aliases = [
  "ai-advisory",
  "audit",
  "auth",
  "charts",
  "config",
  "db",
  "design-system",
  "email",
  "files",
  "import-pipeline",
  "jobs",
  "rbac",
  "testing",
  "ui",
].map((name) => ({
  find: `@qitu/${name}`,
  replacement: join(root, "packages", name, "src", "index.ts"),
}));

async function main() {
  const server = await createServer({
    configFile: false,
    root,
    logLevel: "silent",
    server: {
      middlewareMode: true,
    },
    resolve: {
      alias: aliases,
    },
  });

  try {
    const workerModule = await server.ssrLoadModule("/apps/worker/src/index.ts");
    const { autoCommitCleanImport } = await server.ssrLoadModule(
      "/apps/worker/src/import-job-auto-commit.ts",
    );
    const { getImportAdapter } = await server.ssrLoadModule("/apps/worker/src/import-adapters.ts");
    const { processImportJob } = await server.ssrLoadModule(
      "/apps/worker/src/import-job-runner.ts",
    );
    const { markImportJobProcessingStarted } = await server.ssrLoadModule(
      "/apps/worker/src/import-job-processing-start.ts",
    );
    const { voidImportJob } = await server.ssrLoadModule(
      "/apps/worker/src/import-job-void-statements.ts",
    );
    const worker = workerModule.default;
    const env = await createTestEnv();
    const client = createClient(worker, env);

    await testInboundEmailIntake(worker);
    const { loginAfterReset } = await testAuthBootstrapAndMembers({ client, env, worker });

    const { upload } = await testImportReviewWorkflow({
      autoCommitCleanImport,
      client,
      env,
      getImportAdapter,
      worker,
    });
    await testSourceLifecycle({ client, env, getImportAdapter, worker });
    await testImportProcessingRaces({
      client,
      env,
      getImportAdapter,
      processImportJob,
      worker,
    });
    await testImportMutationRaces({
      autoCommitCleanImport,
      client,
      env,
      getImportAdapter,
      markImportJobProcessingStarted,
      voidImportJob,
      worker,
    });
    await testAuditFilters({ client, loginAfterReset, upload });

    console.log("Worker integration passed.");
  } finally {
    await server.close();
  }
}

await main();

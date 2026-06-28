import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const root = process.cwd();
const require = createRequire(import.meta.url);
const vitePath = require.resolve("vite", {
  paths: [join(root, "apps", "web")],
});
const { createServer } = await import(pathToFileURL(vitePath));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const server = await createServer({
  configFile: false,
  root,
  logLevel: "silent",
  server: {
    middlewareMode: true,
  },
});

try {
  const importPipeline = await server.ssrLoadModule("/packages/import-pipeline/src/index.ts");
  const db = await server.ssrLoadModule("/packages/db/src/index.ts");

  assert(
    importPipeline.createManualReviewIssue().code === "manual_review_required",
    "import-pipeline must create the default manual review issue.",
  );
  assert(
    importPipeline.stagedRecordKeyForSourceRow({
      sourceFileId: "source-1",
      rowIndex: 3,
    }) === "source-file:source-1:row:3",
    "import-pipeline must own staged record key conventions.",
  );
  assert(
    importPipeline.jobStatusAfterRecordDecision("approve") === "approved" &&
      importPipeline.jobStatusAfterRecordDecision("reject") === "needs_review",
    "import-pipeline must own record decision to job status transitions.",
  );
  assert(
    importPipeline.summarizeReviewStatuses(["pending", "approved", "approved", "unknown"])
      .approved === 2,
    "import-pipeline must summarize known review statuses while ignoring unknown values.",
  );
  assert(
    typeof db.users.role === "object" &&
      typeof db.passwordResetTokens.tokenHash === "object" &&
      typeof db.emailMessages.providerMessageId === "object",
    "db package must expose the current auth/email migration baseline.",
  );
} finally {
  await server.close();
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`package interface: ${failure}`);
  }
  console.error(`Package interface tests failed with ${failures.length} failure(s).`);
  process.exit(1);
}

console.log("Package interface tests passed.");

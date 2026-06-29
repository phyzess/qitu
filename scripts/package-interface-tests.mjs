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
  const i18n = await server.ssrLoadModule("/packages/i18n/src/index.ts");

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
    importPipeline.summarizeReviewStatuses(["pending", "approved", "approved", "unknown"])
      .approved === 2,
    "import-pipeline must summarize known review statuses while ignoring unknown values.",
  );
  assert(
    importPipeline.jobStatusForReviewSummary({
      pending: 1,
      approved: 0,
      committed: 1,
    }) === "needs_review",
    "import-pipeline must keep partially committed jobs in review when pending records remain.",
  );
  assert(
    importPipeline.jobStatusForReviewSummary({
      pending: 0,
      approved: 1,
      committed: 1,
    }) === "approved",
    "import-pipeline must surface jobs with approved uncommitted records.",
  );
  assert(
    typeof db.users.role === "object" &&
      typeof db.passwordResetTokens.tokenHash === "object" &&
      typeof db.emailMessages.providerMessageId === "object",
    "db package must expose the current auth/email migration baseline.",
  );
  const localeFormatters = i18n.createLocaleFormatters({
    intlLocale: "en-GB",
  });
  assert(
    localeFormatters.formatPlural(2, {
      one: "{count} item",
      other: "{count} items",
    }) === "2 items",
    "i18n package must format plural messages.",
  );
  assert(
    localeFormatters.formatRelativeTime(-1, "day") === "yesterday",
    "i18n package must format relative time.",
  );
  assert(
    i18n.resolveLocale({
      candidates: i18n.localeCandidatesFromAcceptLanguage("zh-CN, en;q=0.8"),
      defaultLocale: "en",
      localeOptions: [
        {
          id: "en",
          label: "English",
          shortLabel: "EN",
          htmlLang: "en",
          intlLocale: "en-GB",
        },
        {
          id: "zh-CN",
          label: "简体中文",
          shortLabel: "中",
          htmlLang: "zh-CN",
          intlLocale: "zh-CN",
        },
      ],
    }) === "zh-CN",
    "i18n package must resolve locales from Accept-Language candidates.",
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

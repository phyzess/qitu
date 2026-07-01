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
  const auth = await server.ssrLoadModule("/packages/auth/src/index.ts");
  const importPipeline = await server.ssrLoadModule("/packages/import-pipeline/src/index.ts");
  const db = await server.ssrLoadModule("/packages/db/src/index.ts");
  const i18n = await server.ssrLoadModule("/packages/i18n/src/index.ts");
  const rbac = await server.ssrLoadModule("/packages/rbac/src/index.ts");
  const templateFeature = await server.ssrLoadModule("/templates/feature/src/registry.ts");
  const webApi = await server.ssrLoadModule("/apps/web/src/api.ts");

  assert(
    auth.minimumPasswordLength === 12 &&
      auth.authPasswordPolicy.minLength === auth.minimumPasswordLength,
    "auth package must expose shared password policy constants.",
  );
  assert(
    importPipeline.createManualReviewIssue().code === "manual_review_required",
    "import-pipeline must create the default confirmation gate issue.",
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
    importPipeline.reviewActionForConfirmationAction("confirm") === "approve" &&
      importPipeline.reviewActionForConfirmationAction("exclude") === "reject" &&
      importPipeline.confirmationStatusForStagedStatus("approved") === "confirmed" &&
      importPipeline.confirmationStatusForStagedStatus("rejected") === "excluded",
    "import-pipeline must expose confirmation-language aliases over existing review actions.",
  );
  assert(
    typeof db.users.role === "object" &&
      typeof db.passwordResetTokens.tokenHash === "object" &&
      typeof db.emailMessages.providerMessageId === "object" &&
      typeof db.inboundEmailMessages.rawObjectKey === "object" &&
      typeof db.inboundEmailAttachments.sourceFileId === "object",
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
  const customPolicy = rbac.createRbacPolicy({
    fallbackRole: "viewer",
    permissions: {
      operator: ["source_file:upload", "review:decide"],
      viewer: [],
    },
    roles: ["operator", "viewer"],
  });
  assert(
    rbac.normalizeRoleForPolicy(customPolicy, "missing") === "viewer" &&
      rbac.can({ id: "user-1", role: "operator" }, "review:decide", customPolicy) === true &&
      rbac.can({ id: "user-2", role: "viewer" }, "review:decide", customPolicy) === false,
    "rbac package must let app-owned role policies use product-owned role names without changing the package.",
  );
  assert(
    templateFeature.featureIntegrationFixtures[0]?.filename === "template-feature.csv" &&
      templateFeature.featureWebSurfaces[0]?.detailRoute === "/workspace/template-feature",
    "feature template must export integration fixtures and web surface descriptors.",
  );
  const structuredApiError = await webApi.apiErrorFromResponse(
    new Response(
      JSON.stringify({
        error: {
          code: "invalid_request",
          message: "Backend validation failed.",
          issues: [
            {
              message: "Email is required.",
              path: "email",
            },
          ],
        },
      }),
      {
        headers: {
          "content-type": "application/json",
        },
        status: 400,
      },
    ),
  );
  assert(
    structuredApiError instanceof webApi.ApiRequestError &&
      structuredApiError.message === "Backend validation failed." &&
      structuredApiError.code === "invalid_request" &&
      structuredApiError.issues[0]?.path === "email",
    "web API client must preserve structured backend error messages, codes, and issues.",
  );
  const fallbackApiError = await webApi.apiErrorFromResponse(
    new Response("bad gateway", {
      status: 502,
    }),
  );
  assert(
    fallbackApiError.message === "Request failed with 502" && fallbackApiError.status === 502,
    "web API client must fall back to HTTP status text for non-JSON errors.",
  );
  const networkApiError = webApi.apiNetworkError();
  assert(
    networkApiError.status === 0 && networkApiError.message.includes("Worker connection"),
    "web API client must expose a stable network-style failure message.",
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

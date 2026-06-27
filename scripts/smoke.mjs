import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function exists(path) {
  return existsSync(join(root, path));
}

function text(path) {
  return readFileSync(join(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const packageJson = JSON.parse(text("package.json"));
const appTemplateManifest = JSON.parse(text("templates/app/manifest.json"));
const workspace = text("pnpm-workspace.yaml");
const tsconfig = text("tsconfig.json");
const baseTsconfig = text("tsconfig.base.json");
const aiAdvisoryPackage = text("packages/ai-advisory/src/index.ts");
const dbPackage = text("packages/db/src/index.ts");
const importPipeline = text("packages/import-pipeline/src/index.ts");
const chartsPackage = text("packages/charts/src/index.tsx");
const templateFeature = text("templates/feature/src/import-feature.ts");
const templateFeatureRegistry = text("templates/feature/src/registry.ts");
const exampleImportReview = text("examples/import-review/src/index.ts");
const exampleJsonRecords = text("examples/json-records/src/index.ts");
const authPackage = text("packages/auth/src/index.ts");
const emailPackage = text("packages/email/src/index.ts");
const rbacPackage = text("packages/rbac/src/index.ts");
const workerSource = text("apps/worker/src/index.ts");
const webSource = text("apps/web/src/app.tsx");
const webApi = text("apps/web/src/api.ts");
const webTypes = text("apps/web/src/types.ts");
const webViteConfig = text("apps/web/vite.config.ts");
const workerIntegration = text("scripts/worker-integration.mjs");
const browserSmoke = text("scripts/browser-smoke.mjs");
const opsFailedJobs = text("scripts/ops-failed-jobs.mjs");
const wranglerConfig = text("apps/worker/wrangler.jsonc");
const workflow = text(".github/workflows/verify.yml");
const envExample = text(".env.example");
const workerDevVarsExample = text("apps/worker/.dev.vars.example");
const workerPackage = JSON.parse(text("apps/worker/package.json"));
const webPackage = JSON.parse(text("apps/web/package.json"));
const templateFeaturePackage = JSON.parse(text("templates/feature/package.json"));
const coreMigration = [
  text("apps/worker/migrations/0001_core.sql"),
  text("apps/worker/migrations/0002_intake_reliability.sql"),
  text("apps/worker/migrations/0003_review_commit.sql"),
  text("apps/worker/migrations/0004_auth_email.sql"),
  text("apps/worker/migrations/0005_ai_advisories.sql"),
  text("apps/worker/migrations/0006_user_roles.sql"),
].join("\n");
const readme = text("README.md");
const deployment = text("docs/deployment.md");
const dlqRunbook = text("docs/operations/dlq-remediation.md");
const readmeZh = text("README.zh-CN.md");
const docsZh = text("docs/zh-CN.md");
const legacyImportAdapterName = "Domain" + "ImportAdapter";
const chineseDocs = [
  "README.zh-CN.md",
  "docs/zh-CN.md",
  "docs/kit-completion.zh-CN.md",
  "docs/setup.zh-CN.md",
  "docs/capability-matrix.zh-CN.md",
  "docs/architecture/overview.zh-CN.md",
  "docs/architecture/package-boundaries.zh-CN.md",
  "docs/architecture/data-model.zh-CN.md",
  "docs/architecture/auth-security.zh-CN.md",
  "docs/architecture/import-pipeline.zh-CN.md",
  "docs/architecture/ai-advisory.zh-CN.md",
  "docs/architecture/ui-design-system.zh-CN.md",
  "docs/architecture/dependencies.zh-CN.md",
  "docs/guides/create-app.zh-CN.md",
  "docs/guides/add-feature.zh-CN.md",
  "docs/guides/first-vertical-slice.zh-CN.md",
  "docs/deployment.zh-CN.md",
  "docs/troubleshooting.zh-CN.md",
  "docs/operations/dlq-remediation.zh-CN.md",
  "docs/agents/agent-integration.zh-CN.md",
  "docs/roadmap.zh-CN.md",
  "docs/decisions/decision-log.zh-CN.md",
];

assert(
  packageJson.packageManager === "pnpm@11.5.2",
  "packageManager must stay pinned to pnpm@11.5.2.",
);
assert(
  packageJson.devDependencies.typescript === "7.0.1-rc",
  "typescript must stay pinned to 7.0.1-rc.",
);
assert(
  packageJson.devDependencies["vite-plus"] === "0.2.1",
  "vite-plus must stay pinned to 0.2.1.",
);
assert(packageJson.scripts["setup:local"], "package.json must expose setup:local.");
assert(packageJson.scripts["verify:kit"], "package.json must expose verify:kit.");
assert(packageJson.scripts["deploy:dry-run"], "package.json must expose deploy:dry-run.");
assert(
  packageJson.scripts["deploy:preview:dry-run"],
  "package.json must expose deploy:preview:dry-run.",
);
assert(
  packageJson.scripts["deploy:production:dry-run"],
  "package.json must expose deploy:production:dry-run.",
);
assert(packageJson.scripts["ops:failed-jobs"], "package.json must expose ops:failed-jobs.");
assert(packageJson.scripts["db:migrate:preview"], "package.json must expose db:migrate:preview.");
assert(
  packageJson.scripts["db:migrate:production"],
  "package.json must expose db:migrate:production.",
);
assert(packageJson.scripts["test:integration"], "package.json must expose test:integration.");
assert(packageJson.scripts["test:worker-runtime"], "package.json must expose test:worker-runtime.");
assert(packageJson.scripts["smoke:browser"], "package.json must expose smoke:browser.");
assert(
  packageJson.scripts["verify:kit"].includes("test:worker-runtime"),
  "verify:kit must include Worker runtime tests.",
);
assert(
  packageJson.scripts["verify:kit"].includes("smoke:browser"),
  "verify:kit must include browser smoke.",
);
assert(
  packageJson.devDependencies["@playwright/test"] === "1.61.0",
  "@playwright/test must stay pinned to 1.61.0.",
);
assert(
  packageJson.scripts.smoke.includes("worker-integration.mjs"),
  "smoke script must run Worker integration.",
);
assert(
  packageJson.scripts["deploy:preview:dry-run"].includes("vp run -r build") &&
    packageJson.scripts["deploy:production:dry-run"].includes("vp run -r build"),
  "remote dry-run scripts must build web assets before Worker deploy dry-run.",
);
assert(
  workflow.includes("pnpm exec vp run verify:kit") &&
    workflow.includes("playwright install chromium") &&
    workflow.includes("node-version: 24"),
  "GitHub verify workflow must install Chromium and run verify:kit on Node 24.",
);
assert(workspace.includes("examples/*"), "workspace must include examples/*.");
assert(workspace.includes("templates/feature"), "workspace must include templates/feature.");
assert(!workspace.includes("domains/*"), "workspace must not include domains/*.");
assert(
  tsconfig.includes("./examples/import-review"),
  "root tsconfig must reference examples/import-review.",
);
assert(
  tsconfig.includes("./examples/json-records"),
  "root tsconfig must reference examples/json-records.",
);
assert(tsconfig.includes("./templates/feature"), "root tsconfig must reference templates/feature.");
assert(
  baseTsconfig.includes("@qitu/example-import-review"),
  "base tsconfig must expose the example import-review alias.",
);
assert(
  baseTsconfig.includes("@qitu/example-json-records"),
  "base tsconfig must expose the example json-records alias.",
);
assert(!exists("domains"), "top-level domains/ must not exist.");
assert(exists("examples/import-review"), "examples/import-review must exist.");
assert(exists("examples/json-records"), "examples/json-records must exist.");
assert(exists("templates/app"), "templates/app must exist.");
assert(exists("templates/app/manifest.json"), "templates/app/manifest.json must exist.");
assert(exists("templates/feature"), "templates/feature must exist.");
assert(exists("templates/feature/package.json"), "templates/feature/package.json must exist.");
assert(exists("templates/feature/tsconfig.json"), "templates/feature/tsconfig.json must exist.");
assert(
  exists("templates/feature/src/import-feature.ts"),
  "templates/feature must expose a real TypeScript adapter starter.",
);
assert(
  exists("templates/feature/src/registry.ts"),
  "templates/feature must expose an app-owned registry starter.",
);
assert(
  !exists("templates/feature/src/import-feature.ts.txt"),
  "templates/feature must not regress to an unchecked .ts.txt adapter.",
);
assert(exists("docs/setup.md"), "docs/setup.md must exist.");
assert(exists("docs/kit-completion.md"), "docs/kit-completion.md must exist.");
assert(exists("docs/capability-matrix.md"), "docs/capability-matrix.md must exist.");
assert(exists("docs/deployment.md"), "docs/deployment.md must exist.");
assert(
  exists("docs/operations/dlq-remediation.md"),
  "docs/operations/dlq-remediation.md must exist.",
);
assert(exists("docs/release-notes.md"), "docs/release-notes.md must exist.");
assert(exists("docs/troubleshooting.md"), "docs/troubleshooting.md must exist.");
assert(exists("docs/upgrade-notes.md"), "docs/upgrade-notes.md must exist.");
for (const path of chineseDocs) {
  assert(exists(path), `${path} must exist.`);
}
assert(exists("scripts/doctor.mjs"), "scripts/doctor.mjs must exist.");
assert(exists("scripts/setup-local.mjs"), "scripts/setup-local.mjs must exist.");
assert(exists("scripts/worker-integration.mjs"), "scripts/worker-integration.mjs must exist.");
assert(exists("scripts/browser-smoke.mjs"), "scripts/browser-smoke.mjs must exist.");
assert(exists("scripts/ops-failed-jobs.mjs"), "scripts/ops-failed-jobs.mjs must exist.");
assert(exists("apps/worker/vitest.config.ts"), "worker Vitest runtime config must exist.");
assert(exists("apps/worker/test/tsconfig.json"), "worker runtime test tsconfig must exist.");
assert(exists("apps/worker/test/worker-runtime.test.ts"), "worker runtime smoke test must exist.");
assert(exists(".github/workflows/verify.yml"), "GitHub verify workflow must exist.");
assert(exists("AGENTS.md"), "AGENTS.md must exist.");
assert(exists("CLAUDE.md"), "CLAUDE.md must exist.");
assert(exists("PI.md"), "PI.md must exist.");
assert(exists(".env.example"), ".env.example must exist.");
assert(exists("apps/worker/.dev.vars.example"), "apps/worker/.dev.vars.example must exist.");
assert(exists("apps/web/src/api.ts"), "web API client must exist.");
assert(exists("apps/web/src/types.ts"), "web response types must exist.");
assert(exists("packages/charts/src/index.tsx"), "charts package must expose a TSX entrypoint.");
assert(
  importPipeline.includes("ImportFeatureAdapter"),
  "import pipeline must expose ImportFeatureAdapter.",
);
assert(
  templateFeaturePackage.scripts.typecheck === "tsc --noEmit -p tsconfig.json" &&
    templateFeaturePackage.dependencies["@qitu/import-pipeline"] === "workspace:*",
  "templates/feature must be a typechecked workspace package depending on the import pipeline contract.",
);
assert(
  templateFeature.includes("ImportFeatureAdapter") &&
    templateFeature.includes("commitApproved") &&
    !templateFeature.includes("throw new Error"),
  "templates/feature adapter must be a runnable starter, not an unchecked placeholder.",
);
assert(
  templateFeatureRegistry.includes("featureImportAdapters") &&
    templateFeatureRegistry.includes("selectFeatureImportAdapter"),
  "templates/feature must include an app-owned adapter registry starter.",
);
assert(
  importPipeline.includes("commitApproved") && importPipeline.includes("CommitApprovedContext"),
  "import pipeline commit contract must require approved records and reviewer context.",
);
assert(
  exampleImportReview.includes("commitApproved"),
  "example import-review adapter must implement commitApproved.",
);
assert(
  exampleImportReview.includes("parseExampleStagedRecord") &&
    exampleImportReview.includes('line.toLowerCase() !== "label,value"'),
  "example import-review adapter must own payload parsing and skip its CSV header.",
);
assert(
  exampleJsonRecords.includes("jsonRecordsAdapter") &&
    exampleJsonRecords.includes("parseJsonStagedRecord") &&
    exampleJsonRecords.includes("commitKey"),
  "example json-records adapter must own JSON parsing, payload parsing, and commit output.",
);
assert(
  !importPipeline.includes(legacyImportAdapterName),
  "import pipeline must not expose the legacy adapter name.",
);
assert(
  !dbPackage.includes("example_staged_records") && !dbPackage.includes("example_committed_records"),
  "core db package must not expose example-owned staging or commit tables.",
);
assert(
  chartsPackage.includes("TimeSeriesChart") &&
    chartsPackage.includes("@visx/scale") &&
    chartsPackage.includes("@visx/shape"),
  "charts package must expose a visx-backed TimeSeriesChart primitive.",
);
assert(readme.includes("business-neutral"), "README must describe qitu as business-neutral.");
assert(
  readme.includes("README.zh-CN.md") && readme.includes("docs/zh-CN.md"),
  "README must link to the Chinese documentation entrypoints.",
);
assert(
  readmeZh.includes("鵸鵌") &&
    readmeZh.includes("歧途") &&
    readmeZh.includes("@qitu/*") &&
    readmeZh.includes("docs/zh-CN.md"),
  "Chinese README must preserve the qitu naming story, package prefix, and docs index link.",
);
assert(
  docsZh.includes("README.zh-CN.md") &&
    docsZh.includes("kit-completion.zh-CN.md") &&
    docsZh.includes("architecture/data-model.zh-CN.md") &&
    docsZh.includes("guides/first-vertical-slice.zh-CN.md") &&
    docsZh.includes("agents/agent-integration.zh-CN.md") &&
    docsZh.includes("deployment.zh-CN.md"),
  "Chinese docs index must point to the key Chinese documentation entrypoints.",
);
assert(
  readme.includes("Two app-owned starter feature adapters") &&
    readme.includes("Optional example feature packages") &&
    readme.includes("runnable kit baseline"),
  "README must describe the current starter adapters and optional example packages.",
);
assert(
  Array.isArray(appTemplateManifest.copy) &&
    appTemplateManifest.copy.includes("apps/web") &&
    appTemplateManifest.copy.includes("apps/worker") &&
    appTemplateManifest.copy.includes("packages/auth") &&
    appTemplateManifest.copy.includes("templates/feature") &&
    appTemplateManifest.copy.includes(".env.example"),
  "app template manifest must list the reusable app, package, feature template, and env entrypoints.",
);
for (const path of appTemplateManifest.copy) {
  assert(exists(path), `app template manifest references missing path: ${path}`);
}
for (const path of appTemplateManifest.optionalExamples ?? []) {
  assert(exists(path), `app template optional example references missing path: ${path}`);
}
assert(
  aiAdvisoryPackage.includes("AdvisoryArtifactSchema") &&
    aiAdvisoryPackage.includes("GenerateImportReviewAdvisoryInputSchema") &&
    aiAdvisoryPackage.includes("generateLocalImportReviewAdvisory") &&
    aiAdvisoryPackage.includes("requiresHumanConfirmation"),
  "AI advisory package must expose schemas, local generator, and human confirmation guard.",
);
assert(authPackage.includes("hashPassword"), "auth package must expose password hashing.");
assert(authPackage.includes("createSession"), "auth package must expose session creation.");
assert(authPackage.includes("role: v.string()"), "auth user schema must include a role.");
assert(
  authPackage.includes("RequestPasswordResetInputSchema") &&
    authPackage.includes("ConfirmPasswordResetInputSchema") &&
    authPackage.includes("createPasswordResetToken"),
  "auth package must expose password reset schemas and token creation.",
);
assert(
  rbacPackage.includes('roleNames = ["owner", "admin", "reviewer", "viewer"]') &&
    rbacPackage.includes("rolePermissions") &&
    rbacPackage.includes("viewer: []") &&
    rbacPackage.includes('"invitation:create"') &&
    rbacPackage.includes('"source_file:upload"'),
  "rbac package must expose owner/admin/reviewer/viewer permissions with viewer read-only.",
);
assert(
  emailPackage.includes("EmailMessageSchema") &&
    emailPackage.includes("renderInvitationEmail") &&
    emailPackage.includes("renderPasswordResetEmail"),
  "email package must expose generic auth email message schemas and templates.",
);
assert(
  workerPackage.dependencies["@qitu/ai-advisory"] === "workspace:*",
  "worker must depend on @qitu/ai-advisory.",
);
assert(
  workerPackage.dependencies["@qitu/auth"] === "workspace:*",
  "worker must depend on @qitu/auth.",
);
assert(
  workerPackage.dependencies["@qitu/email"] === "workspace:*",
  "worker must depend on @qitu/email.",
);
assert(
  workerPackage.dependencies["@qitu/rbac"] === "workspace:*",
  "worker must depend on @qitu/rbac.",
);
assert(
  !workerPackage.dependencies["@qitu/example-import-review"] &&
    !workerPackage.dependencies["@qitu/example-json-records"],
  "worker must not depend on optional example packages; starter adapters must be app-owned.",
);
assert(
  workerPackage.dependencies["@qitu/import-pipeline"] === "workspace:*",
  "worker must declare its @qitu/import-pipeline type contract dependency.",
);
assert(
  workerPackage.devDependencies["@cloudflare/vitest-pool-workers"] === "0.16.18" &&
    workerPackage.devDependencies.vitest === "4.1.9" &&
    workerPackage.devDependencies["@vitest/runner"] === "4.1.9" &&
    workerPackage.devDependencies["@vitest/snapshot"] === "4.1.9",
  "worker runtime test dependencies must stay pinned.",
);
assert(
  workerPackage.scripts["test:runtime"] === "vitest run --config vitest.config.ts",
  "worker package must expose test:runtime.",
);
assert(
  webPackage.dependencies["@qitu/charts"] === "workspace:*",
  "web app must depend on the shared charts package.",
);
assert(
  !envExample.includes("DEEPSEEK_API_KEY") &&
    !envExample.includes("AI_PROVIDER") &&
    !workerDevVarsExample.includes("DEEPSEEK_API_KEY") &&
    !workerDevVarsExample.includes("AI_PROVIDER"),
  "env examples must not advertise unimplemented AI provider secrets.",
);
assert(
  coreMigration.includes("password_credentials"),
  "core migration must include password credentials.",
);
assert(coreMigration.includes("token_hash"), "core migration must store token hashes.");
assert(
  coreMigration.includes("password_reset_tokens") && coreMigration.includes("email_messages"),
  "auth email migration must include password reset tokens and email message metadata.",
);
assert(
  coreMigration.includes("ALTER TABLE users ADD COLUMN role") &&
    coreMigration.includes("users_role_idx"),
  "user role migration must add users.role and its index.",
);
assert(
  coreMigration.includes("ai_advisory_artifacts") &&
    coreMigration.includes("ai_advisory_artifacts_job_idx") &&
    coreMigration.includes("ai_advisory_artifacts_status_idx"),
  "AI advisory migration must include advisory artifacts and query indexes.",
);
assert(
  workerSource.includes("readCurrentUser(context)") &&
    workerSource.includes("INSERT INTO source_files") &&
    workerSource.includes("INSERT INTO import_jobs"),
  "source file intake must require a current user and write source_files/import_jobs.",
);
assert(
  workerSource.includes('action: "source_file.uploaded"') &&
    workerSource.includes('action: "import_job.queued"'),
  "source file intake must write upload and import job audit events.",
);
assert(
  workerSource.includes("/api/bootstrap/invitations") &&
    workerSource.includes("bootstrap_disabled") &&
    workerSource.includes("returnToken: isLocalRuntime(context)"),
  "invitation creation must separate local bootstrap from authenticated invitation creation.",
);
assert(
  workerSource.includes("requirePermission(context") &&
    workerSource.includes('action: "rbac.denied"') &&
    workerSource.includes('"invitation:create"') &&
    workerSource.includes('"source_file:upload"') &&
    workerSource.includes('"review:decide"') &&
    workerSource.includes('"import_job:commit"') &&
    workerSource.includes('"ai_advisory:write"'),
  "worker write routes must enforce RBAC permissions and audit denials.",
);
assert(
  workerSource.includes("/api/auth/password-reset/request") &&
    workerSource.includes("/api/auth/password-reset/confirm") &&
    workerSource.includes("auth.password_reset_requested") &&
    workerSource.includes("auth.password_reset_succeeded") &&
    workerSource.includes("UPDATE sessions SET revoked_at"),
  "worker must expose self-service password reset and revoke sessions after reset.",
);
assert(
  workerSource.includes("deliverEmail") &&
    workerSource.includes("email_messages") &&
    workerSource.includes("env.EMAIL.send") &&
    workerSource.includes("renderInvitationEmail") &&
    workerSource.includes("renderPasswordResetEmail"),
  "worker must deliver invitation and password reset emails through the email package.",
);
assert(
  workerSource.includes("hashSourceContent(content)") &&
    workerSource.includes("findDuplicateSourceFile") &&
    workerSource.includes("import_job.dispatch_failed"),
  "source file intake must include content hash idempotency and queue dispatch failure handling.",
);
assert(
  workerSource.includes("status = 'processing'") &&
    workerSource.includes("status = 'needs_review'") &&
    workerSource.includes("markImportJobFailed"),
  "queue consumer must advance import job state and record failures.",
);
assert(
  workerSource.includes("INSERT OR IGNORE INTO example_staged_records") &&
    workerSource.includes("INSERT OR IGNORE INTO import_review_issues") &&
    workerSource.includes("attempt_count = COALESCE") &&
    workerSource.includes("registeredImportAdapters") &&
    workerSource.includes("starterImportReviewAdapter") &&
    workerSource.includes("starterJsonRecordsAdapter") &&
    workerSource.includes("selectImportAdapter") &&
    workerSource.includes("adapter.parseAndStage") &&
    workerSource.includes("adapter.commitApproved"),
  "queue consumer must use multiple registered adapters, stage review records idempotently, and count attempts.",
);
assert(
  !workerSource.includes("@qitu/example-import-review") &&
    !workerSource.includes("@qitu/example-json-records"),
  "worker source must not import optional example packages.",
);
assert(
  workerSource.includes("/api/import-jobs/:jobId/review") &&
    workerSource.includes("/api/import-jobs/:jobId/advisories") &&
    workerSource.includes("/api/import-jobs/:jobId/advisories/:advisoryId/confirm") &&
    workerSource.includes("/api/import-jobs/:jobId/advisories/:advisoryId/dismiss") &&
    workerSource.includes("/api/import-jobs/:jobId/staged-records/:recordId/approve") &&
    workerSource.includes("/api/import-jobs/:jobId/staged-records/:recordId/reject") &&
    workerSource.includes("/api/import-jobs/:jobId/commit") &&
    workerSource.includes("/api/import-jobs/:jobId/retry"),
  "worker must expose review, AI advisory, approve, reject, commit, and retry routes.",
);
assert(
  workerSource.includes('app.get("/api/source-files"') &&
    workerSource.includes('app.get("/api/import-jobs"') &&
    workerSource.includes('app.get("/api/audit-events"'),
  "worker must expose source file, import job, and audit list routes.",
);
assert(
  workerSource.includes("INSERT INTO import_review_decisions") &&
    workerSource.includes("INSERT INTO import_review_record_decisions") &&
    workerSource.includes("INSERT INTO example_committed_records"),
  "review and commit routes must write core decisions and example commit records.",
);
assert(
  workerSource.includes("generateLocalImportReviewAdvisory") &&
    workerSource.includes("INSERT INTO ai_advisory_artifacts") &&
    workerSource.includes('action: "ai_advisory.generated"') &&
    workerSource.includes("`ai_advisory.${targetStatus}`") &&
    workerSource.includes("humanConfirmationRequired") &&
    !workerSource.includes("ai_advisory_artifacts WHERE status = 'confirmed'"),
  "AI advisory routes must persist suggestions, audit human decisions, and stay advisory-only.",
);
assert(
  webViteConfig.includes('"/api": "http://127.0.0.1:8787"'),
  "web dev server must proxy /api to local Worker dev.",
);
assert(
  webViteConfig.includes('"/health": "http://127.0.0.1:8787"'),
  "web dev server must proxy /health to local Worker dev.",
);
assert(
  webApi.includes('credentials: "include"') &&
    webApi.includes("health") &&
    webApi.includes("createLocalInvitation") &&
    webApi.includes("acceptInvitation") &&
    webApi.includes("requestPasswordReset") &&
    webApi.includes("confirmPasswordReset") &&
    webApi.includes("uploadSourceFile") &&
    webApi.includes("listSourceFiles") &&
    webApi.includes("listImportJobs") &&
    webApi.includes("drainLocalImportJobs") &&
    webApi.includes("listAuditEvents") &&
    webApi.includes("getImportJobReview") &&
    webApi.includes("listAiAdvisories") &&
    webApi.includes("generateAiAdvisory") &&
    webApi.includes("confirmAiAdvisory") &&
    webApi.includes("dismissAiAdvisory") &&
    webApi.includes("approveStagedRecord") &&
    webApi.includes("rejectStagedRecord") &&
    webApi.includes("commitImportJob") &&
    webApi.includes("retryImportJob"),
  "web API client must wrap authenticated setup, password reset, upload, source, job, audit, review, AI advisory, decision, commit, and retry calls.",
);
assert(webTypes.includes("role: string"), "web API user type must include role.");
assert(
  webSource.includes("Staged records") &&
    webSource.includes("Audit timeline") &&
    webSource.includes("AI advisory") &&
    webSource.includes("Commit approved") &&
    webSource.includes("TimeSeriesChart") &&
    webSource.includes("Source files") &&
    webSource.includes("Process local queue") &&
    webSource.includes("Accept invitation") &&
    webSource.includes("Reset password") &&
    webSource.includes("readAuthRoute") &&
    webSource.includes('kind === "invite"') &&
    webSource.includes('kind === "reset-password"') &&
    webSource.includes("requestPasswordReset") &&
    webSource.includes("confirmPasswordReset") &&
    webSource.includes("uploadSourceFile") &&
    webSource.includes("approveStagedRecord") &&
    webSource.includes("rejectStagedRecord") &&
    webSource.includes("generateAiAdvisory") &&
    webSource.includes("confirmAiAdvisory") &&
    webSource.includes("dismissAiAdvisory") &&
    webSource.includes("commitImportJob") &&
    webSource.includes("retryImportJob") &&
    webSource.includes("Retry job") &&
    webSource.includes("listAuditEvents"),
  "web app must render and call the API-backed auth reset, review console, source files, AI advisory, decisions, commit, retry, and audit timeline.",
);
assert(
  workerIntegration.includes("/api/bootstrap/invitations") &&
    workerIntegration.includes("viewer@example.com") &&
    workerIntegration.includes("source_file:upload") &&
    workerIntegration.includes("rbac.denied") &&
    workerIntegration.includes("/api/auth/login") &&
    workerIntegration.includes("/api/auth/password-reset/request") &&
    workerIntegration.includes("/api/auth/password-reset/confirm") &&
    workerIntegration.includes("/api/source-files") &&
    workerIntegration.includes("fixture-invalid-number.txt") &&
    workerIntegration.includes("invalid_number") &&
    workerIntegration.includes("fixture-json-records.json") &&
    workerIntegration.includes("starter.json-records") &&
    workerIntegration.includes("commitKey") &&
    workerIntegration.includes("/advisories") &&
    workerIntegration.includes("ai_advisory.generated") &&
    workerIntegration.includes("ai_advisory.confirmed") &&
    workerIntegration.includes("/retry") &&
    workerIntegration.includes("/review") &&
    workerIntegration.includes("/approve") &&
    workerIntegration.includes("/commit") &&
    workerIntegration.includes("/api/audit-events"),
  "Worker integration must exercise invite, login, password reset, text adapter, JSON adapter, AI advisory, retry, review, approve, commit, and audit visibility.",
);
assert(
  workerIntegration.includes("DatabaseSync") &&
    workerIntegration.includes("FakeEmailSender") &&
    workerIntegration.includes("FakeR2Bucket") &&
    workerIntegration.includes("FakeQueue"),
  "Worker integration must provide local D1, Email, R2, and Queue fakes.",
);
assert(
  browserSmoke.includes('spawn(vp, ["run", "dev:all"]') &&
    browserSmoke.includes("chromium.launch") &&
    browserSmoke.includes("/api/bootstrap/invitations") &&
    browserSmoke.includes("/api/auth/password-reset/request") &&
    browserSmoke.includes("Accept invitation") &&
    browserSmoke.includes("Reset password") &&
    browserSmoke.includes("setInputFiles") &&
    browserSmoke.includes("Process local queue") &&
    browserSmoke.includes("Commit approved") &&
    browserSmoke.includes('"rejected"') &&
    browserSmoke.includes("import_job.committed") &&
    browserSmoke.includes("import_review.record_rejected"),
  "Browser smoke must start dev:all and exercise emailed invite/reset links, upload, local queue drain, commit, reject, and audit in a real browser.",
);
assert(
  workerSource.includes("/api/dev/import-jobs/drain") &&
    workerSource.includes("processImportJob(context.env") &&
    workerSource.includes("processImportJob(env, body)"),
  "Worker must expose a local-only import job drain route that reuses Queue handler logic.",
);
assert(
  opsFailedJobs.includes("wrangler") &&
    opsFailedJobs.includes("d1") &&
    opsFailedJobs.includes("execute") &&
    opsFailedJobs.includes("status IN ('failed', 'queued', 'processing')") &&
    opsFailedJobs.includes("failure_class") &&
    opsFailedJobs.includes("--remote"),
  "ops:failed-jobs must provide a read-only D1 snapshot for failed and suspicious import jobs.",
);
assert(
  deployment.includes("docs/operations/dlq-remediation.md") &&
    deployment.includes("vp run ops:failed-jobs") &&
    deployment.includes("does not attach an automatic DLQ consumer"),
  "deployment docs must point to the DLQ remediation runbook and avoid automatic DLQ replay in the starter.",
);
assert(
  dlqRunbook.includes("Cloudflare sends messages to a DLQ") &&
    dlqRunbook.includes("vp run ops:failed-jobs") &&
    dlqRunbook.includes("import_job:retry") &&
    dlqRunbook.includes("Do not update `import_jobs.status` manually") &&
    dlqRunbook.includes("qitu-import-jobs-production-dlq"),
  "DLQ remediation runbook must document triage, retry permissions, no direct SQL updates, and queue names.",
);
assert(
  text("apps/worker/vitest.config.ts").includes("cloudflareTest") &&
    text("apps/worker/vitest.config.ts").includes("./wrangler.jsonc") &&
    text("apps/worker/test/tsconfig.json").includes("@cloudflare/vitest-pool-workers/types") &&
    text("apps/worker/test/worker-runtime.test.ts").includes("cloudflare:workers") &&
    text("apps/worker/test/worker-runtime.test.ts").includes("exports.default.fetch") &&
    text("apps/worker/test/worker-runtime.test.ts").includes("/health") &&
    text("apps/worker/test/worker-runtime.test.ts").includes("/api/source-files"),
  "Worker runtime tests must use the official Cloudflare Vitest pool and cover health plus unauthenticated upload.",
);
assert(coreMigration.includes("content_hash"), "source file migration must include content_hash.");
assert(
  coreMigration.includes("failure_reason") && coreMigration.includes("processing_started_at"),
  "import job migration must include failure and processing state fields.",
);
assert(
  coreMigration.includes("adapter_id") &&
    coreMigration.includes("idempotency_key") &&
    coreMigration.includes("failure_class"),
  "import job migration must include adapter, idempotency, and structured failure fields.",
);
assert(
  coreMigration.includes("import_review_issues") &&
    coreMigration.includes("import_review_decisions") &&
    coreMigration.includes("import_review_record_decisions"),
  "review migration must include core review issue and decision tables.",
);
assert(
  coreMigration.includes("example_staged_records") &&
    coreMigration.includes("example_committed_records"),
  "review migration must include example-owned staging and commit tables.",
);
assert(
  wranglerConfig.includes("SOURCE_FILES") &&
    wranglerConfig.includes("DB") &&
    wranglerConfig.includes("IMPORT_JOBS") &&
    wranglerConfig.includes('"send_email"') &&
    wranglerConfig.includes('"EMAIL"') &&
    wranglerConfig.includes('"MAIL_FROM"') &&
    wranglerConfig.includes('"PUBLIC_APP_URL"'),
  "wrangler config must declare DB, SOURCE_FILES, IMPORT_JOBS, EMAIL, and public URL/mail vars.",
);
assert(
  wranglerConfig.includes('"env"') &&
    wranglerConfig.includes('"preview"') &&
    wranglerConfig.includes('"production"') &&
    wranglerConfig.includes('"qitu-worker-preview"') &&
    wranglerConfig.includes('"qitu-worker-production"'),
  "wrangler config must declare preview and production environments.",
);
assert(
  wranglerConfig.includes('"assets"') &&
    wranglerConfig.includes('"directory": "../web/dist"') &&
    wranglerConfig.includes('"not_found_handling": "single-page-application"') &&
    wranglerConfig.includes('"/api/*"') &&
    wranglerConfig.includes('"/health"'),
  "preview and production wrangler environments must serve same-origin web assets while routing API paths to the Worker.",
);
assert(
  wranglerConfig.includes("dead_letter_queue") &&
    wranglerConfig.includes("qitu-import-jobs-preview-dlq") &&
    wranglerConfig.includes("qitu-import-jobs-production-dlq") &&
    wranglerConfig.includes('"max_retries": 3'),
  "wrangler queue consumers must declare retry and DLQ configuration.",
);
assert(
  wranglerConfig.includes("REPLACE_WITH_PREVIEW_D1_DATABASE_ID") &&
    wranglerConfig.includes("REPLACE_WITH_PRODUCTION_D1_DATABASE_ID"),
  "wrangler remote environments must use obvious D1 database ID placeholders.",
);
assert(
  wranglerConfig.includes('"compatibility_date": "2026-06-24"'),
  "wrangler compatibility_date must stay within wrangler@4.103.0 local runtime support.",
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`smoke: ${failure}`);
  console.error(`\nSmoke failed with ${failures.length} failure(s).`);
  process.exit(1);
}

console.log("Smoke passed.");

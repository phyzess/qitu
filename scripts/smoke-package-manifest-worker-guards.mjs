export function assertPackageManifestWorkerGuards(context) {
  const { assert, workerPackage } = context;

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
    workerPackage.dependencies["@qitu/i18n"] === "workspace:*",
    "worker must depend on @qitu/i18n for locale negotiation.",
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
}

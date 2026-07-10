import { resolveLatestLocalD1MigrationName } from "./wrangler-d1-migrate-local-config.mjs";

export function assertPackageManifestWorkerScriptGuards(context) {
  const { assert, workerPackage, wranglerD1MigrateLocalScript, wranglerTypesScript } = context;
  const latestMigrationName = resolveLatestLocalD1MigrationName("test-migrations", () => [
    "0010_latest.sql",
    "README.md",
    "0009_previous.sql",
  ]);
  const rejectsMissingMigrations = localD1MigrationRejectsMissingMigrations();

  assert(
    workerPackage.scripts["cf:typegen"] === "node ../../scripts/wrangler-types.mjs" &&
      wranglerTypesScript.includes("wrangler") &&
      wranglerTypesScript.includes("Types written to worker-configuration.d.ts"),
    "worker typegen must use the guarded wrangler types wrapper so verify:kit can complete.",
  );
  assert(
    workerPackage.scripts["db:migrate:local"] ===
      "node ../../scripts/wrangler-d1-migrate-local.mjs" &&
      wranglerD1MigrateLocalScript.includes("d1") &&
      wranglerD1MigrateLocalScript.includes("QITU_D1_PERSIST_TO") &&
      wranglerD1MigrateLocalScript.includes("No migrations to apply!") &&
      wranglerD1MigrateLocalScript.includes("readdirSync") &&
      wranglerD1MigrateLocalScript.includes('name.endsWith(".sql")') &&
      !wranglerD1MigrateLocalScript.includes('finalMigrationName = "0007_event_foundations.sql"') &&
      latestMigrationName === "0010_latest.sql" &&
      rejectsMissingMigrations &&
      wranglerD1MigrateLocalScript.includes("\\u2705"),
    "local D1 migrations must derive the final SQL marker and reject an empty migration directory.",
  );
}

function localD1MigrationRejectsMissingMigrations() {
  try {
    resolveLatestLocalD1MigrationName("empty-test-migrations", () => ["README.md"]);
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes("No SQL migrations were found");
  }
}

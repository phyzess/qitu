import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

export const noMigrationsMarker = "No migrations to apply!";
export const timeoutMs = 120_000;

export function resolveLatestLocalD1MigrationName(migrationsDir, readDirectory = readdirSync) {
  const finalMigrationName = readDirectory(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .at(-1);

  if (!finalMigrationName) {
    throw new Error(`No SQL migrations were found in ${migrationsDir}.`);
  }

  return finalMigrationName;
}

export function resolveLocalD1MigrationConfig(env = process.env, platform = process.platform) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const workerDir = join(root, "apps", "worker");
  const args = ["d1", "migrations", "apply", "qitu-dev", "--local"];

  if (env.QITU_D1_PERSIST_TO) {
    args.push("--persist-to", env.QITU_D1_PERSIST_TO);
  }

  return {
    args,
    env,
    finalMigrationName: resolveLatestLocalD1MigrationName(join(workerDir, "migrations")),
    noMigrationsMarker,
    timeoutMs,
    workerDir,
    wrangler: platform === "win32" ? "wrangler.cmd" : "wrangler",
  };
}

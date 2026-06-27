import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const targets = {
  local: {
    database: "qitu-dev",
    args: ["--local"],
  },
  preview: {
    database: "qitu-preview",
    args: ["--env", "preview", "--remote"],
  },
  production: {
    database: "qitu-production",
    args: ["--env", "production", "--remote"],
  },
};

const { target, limit } = parseArgs(process.argv.slice(2));
const config = targets[target];

if (!config) {
  console.error(`Unknown target "${target}". Use local, preview, or production.`);
  process.exit(1);
}

const query = `
  SELECT
    id,
    status,
    failure_class,
    substr(COALESCE(failure_reason, ''), 1, 160) AS failure_reason,
    attempt_count,
    job_kind,
    adapter_id,
    source_file_id,
    updated_at,
    completed_at
  FROM import_jobs
  WHERE status IN ('failed', 'queued', 'processing')
     OR failure_class IS NOT NULL
  ORDER BY updated_at DESC
  LIMIT ${limit};
`
  .trim()
  .replace(/\s+/g, " ");

const wrangler = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
const result = spawnSync(
  wrangler,
  ["d1", "execute", config.database, ...config.args, "--command", query],
  {
    cwd: join(root, "apps", "worker"),
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

function parseArgs(args) {
  let target = "local";
  let limit = 25;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (arg === "--limit") {
      limit = parseLimit(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      limit = parseLimit(arg.slice("--limit=".length));
      continue;
    }

    if (!arg.startsWith("-")) {
      target = arg;
    }
  }

  return {
    target,
    limit,
  };
}

function parseLimit(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 25;
  }

  return Math.min(parsed, 100);
}

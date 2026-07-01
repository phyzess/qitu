import { spawn } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const textEncoder = new TextEncoder();
const targets = {
  local: {
    database: "qitu-dev",
    args: ["--local"],
    appUrlEnv: ["QITU_LOCAL_APP_URL", "QITU_PUBLIC_APP_URL"],
    fallbackAppUrl: "http://localhost:5173",
  },
  preview: {
    database: "qitu-preview",
    args: ["--env", "preview", "--remote"],
    appUrlEnv: ["QITU_PREVIEW_APP_URL", "QITU_PUBLIC_APP_URL"],
    fallbackAppUrl: null,
  },
  production: {
    database: "qitu-production",
    args: ["--env", "production", "--remote"],
    appUrlEnv: ["QITU_PRODUCTION_APP_URL", "QITU_PUBLIC_APP_URL"],
    fallbackAppUrl: null,
  },
};

const options = parseArgs(process.argv.slice(2));
const config = targets[options.target];

if (!config) {
  fail(`Unknown target "${options.target}". Use local, preview, or production.`);
}

if (!options.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.email)) {
  fail("Pass a valid --email for the first admin invitation.");
}

const appUrl = options.appUrl ?? firstConfiguredUrl(config) ?? config.fallbackAppUrl;
if (!appUrl) {
  fail(
    `Missing app URL for ${options.target}. Set ${config.appUrlEnv.join(
      " or ",
    )} or pass --app-url.`,
  );
}

const invitation = await createAdminInvitation({
  appUrl,
  createdBy: options.createdBy ?? `operator:${options.target}`,
  email: options.email,
  expiresDays: options.expiresDays,
});
const sql = insertInvitationSql(invitation);

console.log(`Target: ${options.target}`);
console.log(`Email: ${invitation.email}`);
console.log("Role: admin");
console.log(`Expires: ${invitation.expiresAt}`);

if (options.dryRun) {
  console.log("Dry run complete. No invitation was written and no usable token was printed.");
  process.exit(0);
}

await runD1(config, sql);
console.log("Admin invitation created.");
console.log(
  "Treat this one-time invitation URL as a secret and send it through a private channel:",
);
console.log(invitation.inviteUrl);

function parseArgs(args) {
  let target = "local";
  let email = null;
  let appUrl = null;
  let createdBy = null;
  let expiresDays = 1;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (arg === "--email") {
      email = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
      continue;
    }

    if (arg === "--app-url") {
      appUrl = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--app-url=")) {
      appUrl = arg.slice("--app-url=".length);
      continue;
    }

    if (arg === "--created-by") {
      createdBy = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--created-by=")) {
      createdBy = arg.slice("--created-by=".length);
      continue;
    }

    if (arg === "--expires-days") {
      expiresDays = parseExpiresDays(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--expires-days=")) {
      expiresDays = parseExpiresDays(arg.slice("--expires-days=".length));
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (!arg.startsWith("-")) {
      target = arg;
    }
  }

  return {
    appUrl: appUrl?.trim() || null,
    createdBy: createdBy?.trim() || null,
    dryRun,
    email: email?.trim() || null,
    expiresDays,
    target,
  };
}

function parseExpiresDays(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, 30);
}

async function createAdminInvitation(input) {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + input.expiresDays);
  const token = generateToken();
  const id = crypto.randomUUID();
  const email = normalizeEmail(input.email);

  return {
    auditEventId: crypto.randomUUID(),
    createdAt: now.toISOString(),
    createdBy: input.createdBy,
    email,
    expiresAt: expiresAt.toISOString(),
    id,
    inviteUrl: buildInviteUrl(input.appUrl, token),
    role: "admin",
    status: "pending",
    tokenHash: await hashSecret(token),
  };
}

function generateToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function hashSecret(secret) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return `sha256.${base64UrlEncode(new Uint8Array(digest))}`;
}

function base64UrlEncode(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function buildInviteUrl(appUrl, token) {
  const url = new URL(appUrl);
  url.pathname = `/invite/${token}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function insertInvitationSql(invitation) {
  const metadata = JSON.stringify({
    email: invitation.email,
    role: invitation.role,
    operatorCommand: true,
  });

  return `
    INSERT INTO invitations (
      id, email, role, status, token_hash, expires_at, created_by, created_at
    )
    VALUES (
      ${sqlString(invitation.id)},
      ${sqlString(invitation.email)},
      'admin',
      'pending',
      ${sqlString(invitation.tokenHash)},
      ${sqlString(invitation.expiresAt)},
      ${sqlString(invitation.createdBy)},
      ${sqlString(invitation.createdAt)}
    );

    INSERT INTO audit_events (
      id, action, actor_id, actor_kind, subject_id, subject_kind, metadata_json, occurred_at
    )
    VALUES (
      ${sqlString(invitation.auditEventId)},
      'invitation.created',
      ${sqlString(invitation.createdBy)},
      'system',
      ${sqlString(invitation.id)},
      'invitation',
      ${sqlString(metadata)},
      ${sqlString(invitation.createdAt)}
    );
  `;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function firstConfiguredUrl(config) {
  for (const envVar of config.appUrlEnv) {
    const value = process.env[envVar]?.trim();
    if (value) return value;
  }

  return null;
}

function runD1(config, sql) {
  const wrangler = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
  const timeoutMs = Number(process.env.WRANGLER_D1_EXECUTE_TIMEOUT_MS ?? 180_000);

  return new Promise((resolve, reject) => {
    const child = spawn(
      wrangler,
      ["d1", "execute", config.database, ...config.args, "--command", compactSql(sql)],
      {
        cwd: join(root, "apps", "worker"),
        env: {
          ...process.env,
          CI: process.env.CI ?? "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(`Wrangler D1 admin invitation insert did not finish within ${timeoutMs}ms.`),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Wrangler D1 admin invitation insert exited with code ${code ?? "none"} signal ${
            signal ?? "none"
          }.`,
        ),
      );
    });
  });
}

function compactSql(sql) {
  return sql.trim().replace(/\s+/g, " ");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

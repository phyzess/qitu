import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const target = process.argv.slice(2).find((arg) => !arg.startsWith("-")) ?? "production";
const config = readWranglerConfig();
const targetConfig = target === "local" ? config : config.env?.[target];

if (!targetConfig) {
  fail(`Unknown deploy preflight target "${target}". Use local, preview, or production.`);
}

const vars = targetConfig.vars ?? {};
const sendEmail = targetConfig.send_email ?? config.send_email ?? [];
const d1Databases = targetConfig.d1_databases ?? config.d1_databases ?? [];
const queues = targetConfig.queues ?? config.queues ?? {};
const assets = targetConfig.assets ?? config.assets ?? null;
const errors = [];
const warnings = [];

checkAppEnv();
checkPublicAppUrl();
checkEmailConfig();
checkBindings();
printSummary();

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error("Deploy preflight failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Deploy preflight passed for ${target}.`);

function readWranglerConfig() {
  const raw = readFileSync(join(root, "apps", "worker", "wrangler.jsonc"), "utf8");
  return JSON.parse(stripJsonc(raw));
}

function stripJsonc(value) {
  let output = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output.replace(/,\s*([}\]])/g, "$1");
}

function checkAppEnv() {
  const expected = target === "local" ? "local" : target;
  if (vars.APP_ENV !== expected) {
    errors.push(`APP_ENV must be "${expected}" for ${target}.`);
  }
}

function checkPublicAppUrl() {
  const value = stringValue(vars.PUBLIC_APP_URL);
  if (!value) {
    errors.push("PUBLIC_APP_URL is required.");
    return;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push("PUBLIC_APP_URL must be an absolute URL.");
    return;
  }

  const hostname = url.hostname.toLowerCase();
  if (target !== "local") {
    if (url.protocol !== "https:") {
      errors.push("PUBLIC_APP_URL must use https outside local development.");
    }

    if (isLocalHostname(hostname)) {
      errors.push("PUBLIC_APP_URL must not point to localhost outside local development.");
    }

    if (isExampleDomain(hostname)) {
      errors.push("PUBLIC_APP_URL must be replaced before preview or production.");
    }

    if (isWorkersDev(hostname)) {
      errors.push("PUBLIC_APP_URL must be the public custom origin, not workers.dev.");
    }
  }
}

function checkEmailConfig() {
  const mode = stringValue(vars.EMAIL_DELIVERY_MODE) ?? (target === "local" ? "store" : "send");
  if (target !== "local" && mode !== "send") {
    errors.push("EMAIL_DELIVERY_MODE must be send outside local development.");
  }

  const mailFrom = stringValue(vars.MAIL_FROM);
  if (!mailFrom) {
    errors.push("MAIL_FROM is required.");
    return;
  }

  const fromDomain = emailDomain(mailFrom);
  if (!fromDomain) {
    errors.push("MAIL_FROM must be a valid email address.");
    return;
  }

  if (target !== "local" && isExampleDomain(fromDomain)) {
    errors.push("MAIL_FROM must use a verified Cloudflare Email sender domain.");
  }

  const appHostname = hostnameOf(vars.PUBLIC_APP_URL);
  if (target !== "local" && appHostname && !domainsAlign(appHostname, fromDomain)) {
    warnings.push(
      `MAIL_FROM domain ${fromDomain} does not obviously align with PUBLIC_APP_URL host ${appHostname}.`,
    );
  }

  const replyTo = stringValue(vars.MAIL_REPLY_TO);
  if (replyTo) {
    const replyDomain = emailDomain(replyTo);
    if (!replyDomain) {
      errors.push("MAIL_REPLY_TO must be empty or a valid email address.");
    } else if (target !== "local" && isExampleDomain(replyDomain)) {
      errors.push("MAIL_REPLY_TO must not use example.com outside local development.");
    }
  }
}

function checkBindings() {
  if (!Array.isArray(sendEmail) || !sendEmail.some((binding) => binding?.name === "EMAIL")) {
    errors.push("send_email binding named EMAIL is required.");
  }

  const db = Array.isArray(d1Databases)
    ? d1Databases.find((database) => database?.binding === "DB")
    : null;
  if (!db) {
    errors.push("D1 binding named DB is required.");
  } else if (target !== "local" && isPlaceholder(db.database_id)) {
    errors.push("Remote D1 database_id must be replaced before deployment.");
  }

  const consumers = Array.isArray(queues.consumers) ? queues.consumers : [];
  if (!consumers.some((consumer) => consumer?.dead_letter_queue)) {
    errors.push("Import queue consumer must define a dead_letter_queue.");
  }

  if (target !== "local") {
    if (!assets?.directory || !assets?.run_worker_first?.includes("/api/*")) {
      errors.push("Preview and production must serve web assets with the Worker handling /api/*.");
    }
  }
}

function printSummary() {
  const publicUrl = stringValue(vars.PUBLIC_APP_URL) ?? "missing";
  const fromDomain = emailDomain(stringValue(vars.MAIL_FROM) ?? "") ?? "missing";
  const replyTo = stringValue(vars.MAIL_REPLY_TO);
  const mode = stringValue(vars.EMAIL_DELIVERY_MODE) ?? (target === "local" ? "store" : "send");
  const db = Array.isArray(d1Databases)
    ? d1Databases.find((database) => database?.binding === "DB")
    : null;

  console.log(`Deploy preflight target: ${target}`);
  console.log(`- APP_ENV: ${vars.APP_ENV ?? "missing"}`);
  console.log(`- PUBLIC_APP_URL: ${publicUrl}`);
  console.log(`- EMAIL_DELIVERY_MODE: ${mode}`);
  console.log(`- MAIL_FROM domain: ${fromDomain}`);
  console.log(`- MAIL_REPLY_TO configured: ${replyTo ? "yes" : "no"}`);
  console.log(
    `- D1 database_id configured: ${db && !isPlaceholder(db.database_id) ? "yes" : "no"}`,
  );
  console.log(
    `- send_email EMAIL binding: ${sendEmail.some((binding) => binding?.name === "EMAIL") ? "yes" : "no"}`,
  );
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hostnameOf(value) {
  const text = stringValue(value);
  if (!text) return null;

  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function emailDomain(value) {
  const domain = value.split("@")[1]?.toLowerCase();
  return domain && /^[^\s@]+\.[^\s@]+$/.test(domain) ? domain : null;
}

function domainsAlign(hostname, emailDomainValue) {
  return (
    hostname === emailDomainValue ||
    hostname.endsWith(`.${emailDomainValue}`) ||
    emailDomainValue.endsWith(`.${hostname}`)
  );
}

function isPlaceholder(value) {
  return (
    !value || value === "00000000-0000-0000-0000-000000000000" || value.includes("REPLACE_WITH")
  );
}

function isExampleDomain(hostname) {
  return hostname === "example.com" || hostname.endsWith(".example.com");
}

function isLocalHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

function isWorkersDev(hostname) {
  return hostname === "workers.dev" || hostname.endsWith(".workers.dev");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

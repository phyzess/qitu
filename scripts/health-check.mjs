import process from "node:process";

const targetConfigs = {
  local: {
    expectedEnvironment: "local",
    envVars: ["QITU_HEALTH_URL", "QITU_LOCAL_APP_URL", "QITU_PUBLIC_APP_URL"],
    fallbackUrl: "http://127.0.0.1:8787",
  },
  preview: {
    expectedEnvironment: "preview",
    envVars: ["QITU_HEALTH_URL", "QITU_PREVIEW_APP_URL", "QITU_PUBLIC_APP_URL"],
    fallbackUrl: null,
  },
  production: {
    expectedEnvironment: "production",
    envVars: ["QITU_HEALTH_URL", "QITU_PRODUCTION_APP_URL", "QITU_PUBLIC_APP_URL"],
    fallbackUrl: null,
  },
};

const options = parseArgs(process.argv.slice(2));
const config = targetConfigs[options.target];

if (!config && !options.url) {
  fail(`Unknown health target "${options.target}". Use local, preview, production, or --url.`);
}

const expectedEnvironment = options.expectedEnvironment ?? config?.expectedEnvironment ?? null;
const rawUrl = options.url ?? firstConfiguredUrl(config) ?? config?.fallbackUrl;

if (!rawUrl) {
  const expectedVars = config?.envVars.filter((name) => name !== "QITU_HEALTH_URL") ?? [];
  fail(`Missing health URL for ${options.target}. Set ${expectedVars.join(" or ")} or pass --url.`);
}

const healthUrl = toHealthUrl(rawUrl);
const timeoutMs = Number(process.env.QITU_HEALTH_TIMEOUT_MS ?? 15_000);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(healthUrl, {
    headers: { accept: "application/json" },
    signal: controller.signal,
  });

  if (!response.ok) {
    fail(`Health check failed with HTTP ${response.status} from ${healthUrl}.`);
  }

  const body = await response.json();
  if (body?.ok !== true || body?.service !== "qitu-worker") {
    fail("Health check response did not match the qitu Worker contract.");
  }

  if (expectedEnvironment && body.environment !== expectedEnvironment) {
    fail(
      `Health check expected APP_ENV=${expectedEnvironment} but received APP_ENV=${body.environment}.`,
    );
  }

  console.log(
    `Health check passed: target=${options.target} environment=${body.environment} url=${healthUrl}`,
  );
} catch (error) {
  if (error?.name === "AbortError") {
    fail(`Health check timed out after ${timeoutMs}ms for ${healthUrl}.`);
  }

  fail(`Health check request failed for ${healthUrl}: ${error.message}`);
} finally {
  clearTimeout(timeout);
}

function parseArgs(args) {
  let target = "local";
  let url = null;
  let expectedEnvironment = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (arg === "--url") {
      url = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--url=")) {
      url = arg.slice("--url=".length);
      continue;
    }

    if (arg === "--expect-env") {
      expectedEnvironment = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--expect-env=")) {
      expectedEnvironment = arg.slice("--expect-env=".length);
      continue;
    }

    if (!arg.startsWith("-")) {
      target = arg;
    }
  }

  if (/^https?:\/\//.test(target) && !url) {
    url = target;
    target = "custom";
  }

  return { expectedEnvironment, target, url };
}

function firstConfiguredUrl(config) {
  if (!config) return null;

  for (const envVar of config.envVars) {
    const value = process.env[envVar]?.trim();
    if (value) return value;
  }

  return null;
}

function toHealthUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`Invalid health URL: ${value}`);
  }

  const path = url.pathname.replace(/\/$/, "");
  url.pathname = path.endsWith("/health") ? path : `${path}/health`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

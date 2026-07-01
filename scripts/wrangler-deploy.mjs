import { spawn } from "node:child_process";
import process from "node:process";

const passthroughArgs = process.argv.slice(2);

if (passthroughArgs.includes("--dry-run")) {
  console.error("Use scripts/wrangler-deploy-dry-run.mjs for dry-run deployments.");
  process.exit(1);
}

const wrangler = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
const timeoutMs = Number(process.env.WRANGLER_DEPLOY_TIMEOUT_MS ?? 300_000);
const child = spawn(wrangler, ["deploy", ...passthroughArgs], {
  env: {
    ...process.env,
    CI: process.env.CI ?? "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let settled = false;

const timeout = setTimeout(() => {
  finish(1, `Wrangler deploy did not finish within ${timeoutMs}ms.`);
}, timeoutMs);

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
});

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

child.on("error", (error) => {
  finish(1, `Failed to start Wrangler: ${error.message}`);
});

child.on("close", (code, signal) => {
  if (settled) return;
  if (code === 0) {
    finish(0);
    return;
  }

  finish(1, `Wrangler deploy exited with code ${code ?? "none"} signal ${signal ?? "none"}.`);
});

function finish(code, message) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);

  if (message) {
    console.error(message);
  }

  if (child.exitCode === null && !child.killed) {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    process.exit(code);
  }, 25);
}

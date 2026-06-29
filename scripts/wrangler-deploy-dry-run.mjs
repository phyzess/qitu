import { spawn } from "node:child_process";
import process from "node:process";

const successMarker = "--dry-run: exiting now.";
const timeoutMs = Number(process.env.WRANGLER_DRY_RUN_TIMEOUT_MS ?? 180_000);
const passthroughArgs = process.argv.slice(2);
const wranglerArgs = ["deploy", ...passthroughArgs];

if (!wranglerArgs.includes("--dry-run")) {
  wranglerArgs.push("--dry-run");
}

const child = spawn("wrangler", wranglerArgs, {
  env: {
    ...process.env,
    CI: process.env.CI ?? "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let sawSuccessMarker = false;
let settled = false;

const timeout = setTimeout(() => {
  finish(1, `Wrangler dry-run did not finish within ${timeoutMs}ms.`);
}, timeoutMs);

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  observe(String(chunk));
});

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  observe(String(chunk));
});

child.on("error", (error) => {
  finish(1, `Failed to start Wrangler: ${error.message}`);
});

child.on("close", (code, signal) => {
  if (settled) return;
  if (code === 0 || sawSuccessMarker) {
    finish(0);
    return;
  }

  finish(1, `Wrangler dry-run exited with code ${code ?? "none"} signal ${signal ?? "none"}.`);
});

function observe(output) {
  if (output.includes(successMarker)) {
    sawSuccessMarker = true;
    setTimeout(() => finish(0), 250);
  }
}

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

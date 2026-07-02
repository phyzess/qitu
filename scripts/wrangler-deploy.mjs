import { spawn } from "node:child_process";
import process from "node:process";

const passthroughArgs = process.argv.slice(2);

if (passthroughArgs.includes("--dry-run")) {
  console.error("Use scripts/wrangler-deploy-dry-run.mjs for dry-run deployments.");
  process.exit(1);
}

const wrangler = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
const timeoutMs = Number(process.env.WRANGLER_DEPLOY_TIMEOUT_MS ?? 300_000);
const whoamiTimeoutMs = Number(process.env.WRANGLER_WHOAMI_TIMEOUT_MS ?? 60_000);

try {
  await runWrangler(["whoami"], whoamiTimeoutMs);
  const output = await runWrangler(["deploy", ...passthroughArgs], timeoutMs);
  const versionId = findWorkerVersionId(output);
  if (!versionId) {
    throw new Error("Wrangler deploy succeeded, but no Worker version id was found in output.");
  }

  console.log(`Worker version id: ${versionId}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function runWrangler(args, commandTimeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(wrangler, args, {
      env: {
        ...process.env,
        CI: process.env.CI ?? "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let settled = false;

    const timeout = setTimeout(() => {
      finish(new Error(`Wrangler ${args[0]} did not finish within ${commandTimeoutMs}ms.`));
    }, commandTimeoutMs);

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      output += String(chunk);
      process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      finish(new Error(`Failed to start Wrangler: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        finish();
        return;
      }

      finish(
        new Error(
          `Wrangler ${args[0]} exited with code ${code ?? "none"} signal ${signal ?? "none"}.`,
        ),
      );
    });

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (child.exitCode === null && !child.killed) {
        child.kill("SIGTERM");
      }

      setTimeout(() => {
        if (error) {
          reject(error);
          return;
        }

        resolve(output);
      }, 25);
    }
  });
}

function findWorkerVersionId(output) {
  const patterns = [
    /\bWorker version id:\s*([a-f0-9-]{16,})\b/i,
    /\bVersion ID:\s*([a-f0-9-]{16,})\b/i,
    /\bversion[_ ]id["':=\s]+([a-f0-9-]{16,})\b/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

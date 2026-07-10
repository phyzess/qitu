import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import process from "node:process";

export async function prepareBrowserSmokeDatabase({
  persistTo,
  root,
  env = process.env,
  platform = process.platform,
}) {
  await rm(persistTo, { force: true, recursive: true });
  await runLocalD1Migrations({ env, persistTo, platform, root });
}

export function cleanupBrowserSmokeDatabase(persistTo) {
  return rm(persistTo, { force: true, recursive: true });
}

function runLocalD1Migrations({ env, persistTo, platform, root }) {
  const vp = platform === "win32" ? "vp.cmd" : "vp";

  return new Promise((resolve, reject) => {
    const child = spawn(vp, ["run", "db:migrate:local"], {
      cwd: root,
      env: {
        ...env,
        QITU_D1_PERSIST_TO: persistTo,
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.on("data", rememberOutput);
    child.stderr.on("data", rememberOutput);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Browser smoke D1 migration failed with code ${code ?? "none"} signal ${signal ?? "none"}.\n${output}`,
        ),
      );
    });

    function rememberOutput(chunk) {
      output = `${output}${chunk.toString("utf8")}`.slice(-12_000);
    }
  });
}

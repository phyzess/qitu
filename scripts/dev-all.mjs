import { spawn } from "node:child_process";
import { createServer } from "node:net";
import readline from "node:readline";
import process from "node:process";

const vp = process.platform === "win32" ? "vp.cmd" : "vp";
const webPort = process.env.QITU_WEB_PORT ?? (await findOpenPort());
const workerPort = process.env.QITU_WORKER_PORT ?? (await findOpenPort(new Set([webPort])));
const workerOrigin = process.env.QITU_WORKER_ORIGIN ?? `http://127.0.0.1:${workerPort}`;
const publicAppUrl =
  process.env.QITU_PUBLIC_APP_URL ?? process.env.PUBLIC_APP_URL ?? `http://localhost:${webPort}`;
const sharedEnv = {
  ...process.env,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL ?? publicAppUrl,
  QITU_PUBLIC_APP_URL: publicAppUrl,
  QITU_WEB_PORT: webPort,
  QITU_WORKER_ORIGIN: workerOrigin,
  QITU_WORKER_PORT: workerPort,
};
const commands = [
  { name: "web", args: ["run", "--filter", "@qitu/web", "dev"] },
  { name: "worker", args: ["run", "--filter", "@qitu/worker", "dev"] },
];

const children = [];
let stopping = false;

console.log(`qitu local dev: web http://localhost:${webPort}`);
console.log(`qitu local dev: worker ${workerOrigin}`);

function pipeWithPrefix(stream, prefix, writer) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => writer.write(`[${prefix}] ${line}\n`));
}

function stopAll(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const command of commands) {
  const child = spawn(vp, command.args, {
    cwd: process.cwd(),
    env: sharedEnv,
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
  });

  children.push(child);
  pipeWithPrefix(child.stdout, command.name, process.stdout);
  pipeWithPrefix(child.stderr, command.name, process.stderr);

  child.on("exit", (code, signal) => {
    if (stopping) return;
    if (code && code !== 0) {
      console.error(`[${command.name}] exited with code ${code}`);
      process.exitCode = code;
      stopAll();
      return;
    }
    if (signal) {
      console.error(`[${command.name}] exited by signal ${signal}`);
      process.exitCode = 1;
      stopAll();
    }
  });
}

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));

async function findOpenPort(excluded = new Set()) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a local dev port.")));
        return;
      }

      const port = String(address.port);
      server.close(async () => {
        if (excluded.has(port)) {
          try {
            resolve(await findOpenPort(excluded));
          } catch (error) {
            reject(error);
          }
          return;
        }

        resolve(port);
      });
    });
  });
}

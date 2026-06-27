import { spawn } from "node:child_process";
import readline from "node:readline";
import process from "node:process";

const vp = process.platform === "win32" ? "vp.cmd" : "vp";
const commands = [
  { name: "web", args: ["run", "--filter", "@qitu/web", "dev"] },
  { name: "worker", args: ["run", "--filter", "@qitu/worker", "dev"] },
];

const children = [];
let stopping = false;

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

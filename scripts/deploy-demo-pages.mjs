import { spawn } from "node:child_process";
import process from "node:process";

const options = parseArgs(process.argv.slice(2));

console.log(`Demo Pages project: ${options.projectName}`);
console.log(`Demo Pages branch: ${options.branch}`);
console.log("Demo API mode: mock");

await run("vp", ["run", "build:demo"], {
  env: {
    ...process.env,
    VITE_QITU_API_MODE: "mock",
  },
});
await run("wrangler", ["whoami"]);
await run("wrangler", [
  "pages",
  "deploy",
  "apps/web/dist",
  "--project-name",
  options.projectName,
  "--branch",
  options.branch,
  "--commit-dirty=true",
]);

function parseArgs(args) {
  let projectName = process.env.QITU_DEMO_PAGES_PROJECT?.trim() || "qitu-demo";
  let branch = process.env.QITU_DEMO_PAGES_BRANCH?.trim() || "main";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (arg === "--") {
      continue;
    }

    if (arg === "--project-name") {
      projectName = requireValue(args[index + 1], "--project-name");
      index += 1;
      continue;
    }

    if (arg.startsWith("--project-name=")) {
      projectName = requireValue(arg.slice("--project-name=".length), "--project-name");
      continue;
    }

    if (arg === "--branch") {
      branch = requireValue(args[index + 1], "--branch");
      index += 1;
      continue;
    }

    if (arg.startsWith("--branch=")) {
      branch = requireValue(arg.slice("--branch=".length), "--branch");
      continue;
    }

    fail(`Unknown demo deploy argument: ${arg}`);
  }

  return {
    branch,
    projectName,
  };
}

function requireValue(value, name) {
  const trimmed = value?.trim();
  if (!trimmed) {
    fail(`${name} requires a non-empty value.`);
  }
  return trimmed;
}

function run(command, args, options = {}) {
  console.log(`\n> ${[command, ...args].join(" ")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env ?? process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${[command, ...args].join(" ")} failed with code ${code ?? "none"} signal ${
            signal ?? "none"
          }.`,
        ),
      );
    });
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

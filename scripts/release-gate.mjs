import { spawn } from "node:child_process";
import process from "node:process";

const targets = {
  preview: {
    appUrlVars: ["QITU_PREVIEW_APP_URL", "QITU_PUBLIC_APP_URL", "QITU_HEALTH_URL"],
    steps: [
      ["vp", "run", "verify:kit"],
      ["vp", "run", "deploy:preview:dry-run"],
      ["vp", "run", "db:migrate:preview"],
      ["vp", "run", "ops:failed-jobs", "--", "preview"],
      ["vp", "run", "deploy:preview"],
    ],
  },
  production: {
    appUrlVars: ["QITU_PRODUCTION_APP_URL", "QITU_PUBLIC_APP_URL", "QITU_HEALTH_URL"],
    steps: [
      ["vp", "run", "verify:kit"],
      ["vp", "run", "deploy:production:dry-run"],
      ["vp", "run", "db:migrate:production"],
      ["vp", "run", "ops:failed-jobs", "--", "production"],
      ["vp", "run", "deploy:production"],
    ],
  },
};

const options = parseArgs(process.argv.slice(2));
const config = targets[options.target];

if (!config) {
  fail(`Unknown release target "${options.target}". Use preview or production.`);
}

const steps = withFailedJobLimit(config.steps, options.failedJobLimit);

printPlan(options.target, config, steps);

if (!options.execute) {
  console.log(`Plan only. Re-run with --yes to execute the ${options.target} release gate.`);
  process.exit(0);
}

if (!hasAnyEnv(config.appUrlVars)) {
  fail(
    `Missing deployed app URL for ${options.target}. Set one of: ${config.appUrlVars.join(", ")}.`,
  );
}

try {
  for (const [command, ...args] of steps) {
    await run(command, args);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

console.log(`Release gate completed for ${options.target}.`);

function parseArgs(args) {
  let target = null;
  let execute = false;
  let failedJobLimit = 50;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (arg === "--") {
      continue;
    }

    if (arg === "--yes" || arg === "--execute") {
      execute = true;
      continue;
    }

    if (arg === "--plan") {
      execute = false;
      continue;
    }

    if (arg === "--failed-job-limit") {
      failedJobLimit = parseLimit(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--failed-job-limit=")) {
      failedJobLimit = parseLimit(arg.slice("--failed-job-limit=".length));
      continue;
    }

    if (!arg.startsWith("-") && !target) {
      target = arg;
      continue;
    }

    fail(`Unknown release gate argument: ${arg}`);
  }

  return {
    execute,
    failedJobLimit,
    target: target ?? "preview",
  };
}

function parseLimit(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    fail("--failed-job-limit must be a positive integer.");
  }

  return Math.min(parsed, 100);
}

function withFailedJobLimit(steps, limit) {
  return steps.map((step) => {
    if (step.includes("ops:failed-jobs")) {
      return [...step, "--limit", String(limit)];
    }

    return step;
  });
}

function printPlan(target, config, steps) {
  console.log(`Release gate target: ${target}`);
  console.log(`Required app URL env: one of ${config.appUrlVars.join(", ")}`);
  console.log("Steps:");
  for (const step of steps) {
    console.log(`- ${formatStep(step)}`);
  }
}

function formatStep(step) {
  return step.join(" ");
}

function hasAnyEnv(names) {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function run(command, args) {
  const executable = command === "vp" && process.platform === "win32" ? "vp.cmd" : command;
  console.log(`\n> ${formatStep([command, ...args])}`);

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI: process.env.CI ?? "1",
      },
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
          `${formatStep([command, ...args])} failed with code ${code ?? "none"} signal ${
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

import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const appName = stringArg("name");
const namespace = args.namespace ?? `@${appName}`;
const workerName = args["worker-name"] ?? `${appName}-worker`;
const cookieName = args["cookie-name"] ?? `${appName}_session`;
const appTitle = args["app-title"] ?? appName;
const apply = Boolean(args.apply);
const cleanProductBaseline = Boolean(args["clean-product-baseline"]);
const upstreamRemote = args["upstream-remote"] ?? "qitu-template";

validateAppName(appName);
validateNamespace(namespace);

const replacements = [
  replacement("@qitu/", `${namespace}/`, "package namespace"),
  replacement('"name": "qitu"', `"name": "${appName}"`, "root package name"),
  replacement("qitu_session", cookieName, "session cookie name"),
  replacement("qitu-worker", workerName, "Worker name"),
  replacement("qitu-dev", `${appName}-dev`, "local Cloudflare resource names"),
  replacement("qitu-preview", `${appName}-preview`, "preview Cloudflare resource names"),
  replacement("qitu-production", `${appName}-production`, "production Cloudflare resource names"),
  replacement("qitu-source-files", `${appName}-source-files`, "R2 bucket name prefix"),
  replacement("qitu-import-jobs", `${appName}-import-jobs`, "Queue name prefix"),
  replacement("PUBLIC_APP_NAME=qitu", `PUBLIC_APP_NAME=${appTitle}`, "public app name env"),
];

const cleanupPaths = [
  "templates",
  "examples",
  "docs/guides",
  "docs/templates",
  "docs/agents",
  "docs/kit-completion.md",
  "docs/kit-completion.zh-CN.md",
  "docs/capability-matrix.md",
  "docs/capability-matrix.zh-CN.md",
  "docs/release-notes.md",
  "docs/upgrade-notes.md",
  "docs/roadmap.md",
  "docs/roadmap.zh-CN.md",
];

const files = collectTextFiles(root);
const edits = [];

for (const file of files) {
  const before = readFileSync(file, "utf8");
  let after = before;
  const labels = [];

  for (const item of replacements) {
    if (after.includes(item.from)) {
      after = after.split(item.from).join(item.to);
      labels.push(item.label);
    }
  }

  if (after !== before) {
    edits.push({
      file,
      labels: [...new Set(labels)],
      nextText: after,
    });
  }
}

const removals = cleanProductBaseline
  ? cleanupPaths.filter((path) => existsSync(join(root, path)))
  : [];

printPlan({ edits, removals });

if (apply) {
  for (const edit of edits) {
    writeFileSync(edit.file, edit.nextText);
  }

  for (const path of removals) {
    rmSync(join(root, path), { force: true, recursive: true });
  }

  console.log(`Applied ${edits.length} file edit(s).`);
  if (removals.length > 0) {
    console.log(`Removed ${removals.length} scaffold path(s).`);
  }
} else {
  console.log("Dry run only. Re-run with --apply to write files.");
}

console.log("");
console.log("Remote safety steps to run manually after reviewing the diff:");
console.log(`  git remote rename origin ${upstreamRemote}`);
console.log(`  git remote set-url --push ${upstreamRemote} DISABLED`);
console.log("  git remote add origin <app-owned-git-url>");

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) {
      fail(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    if (key === "apply" || key === "clean-product-baseline") {
      parsed[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${key}.`);
    }
    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function stringArg(name) {
  const value = args[name];
  if (!value) {
    fail(`Pass --${name} for the adopted application identity.`);
  }
  return value;
}

function replacement(from, to, label) {
  return { from, label, to };
}

function validateAppName(value) {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    fail("--name must be lowercase kebab-case, for example: internal-tool");
  }
}

function validateNamespace(value) {
  if (!/^@[a-z][a-z0-9-]*(?:-[a-z0-9]+)*$/.test(value)) {
    fail("--namespace must be a scoped package namespace, for example: @internal-tool");
  }
}

function collectTextFiles(directory) {
  const ignoredDirectories = new Set([
    ".git",
    ".wrangler",
    "dist",
    "node_modules",
    "playwright-report",
    "test-results",
  ]);
  const extensions = new Set([
    ".cjs",
    ".css",
    ".json",
    ".jsonc",
    ".md",
    ".mjs",
    ".sql",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
  ]);
  const exactFiles = new Set([
    ".dev.vars.example",
    ".env.example",
    ".gitignore",
    ".npmrc",
    ".prettierignore",
    "AGENTS.md",
    "CLAUDE.md",
    "PI.md",
    "README.md",
  ]);
  const collected = [];

  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          visit(join(current, entry.name));
        }
        continue;
      }

      const absolute = join(current, entry.name);
      const relativePath = relative(root, absolute);
      const extension = entry.name.includes(".")
        ? entry.name.slice(entry.name.lastIndexOf("."))
        : "";
      if (extensions.has(extension) || exactFiles.has(relativePath)) {
        collected.push(absolute);
      }
    }
  }

  visit(directory);
  return collected;
}

function printPlan({ edits, removals }) {
  console.log(`Adopting qitu as ${appName}`);
  console.log(`Namespace: ${namespace}`);
  console.log(`Worker: ${workerName}`);
  console.log(`Cookie: ${cookieName}`);
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`Planned file edits: ${edits.length}`);

  for (const edit of edits.slice(0, 80)) {
    console.log(`  ${relative(root, edit.file)} (${edit.labels.join(", ")})`);
  }
  if (edits.length > 80) {
    console.log(`  ... ${edits.length - 80} more`);
  }

  if (cleanProductBaseline) {
    console.log("");
    console.log(`Planned scaffold cleanup: ${removals.length}`);
    for (const path of removals) {
      const stats = statSync(join(root, path));
      console.log(`  ${path}${stats.isDirectory() ? "/" : ""}`);
    }
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

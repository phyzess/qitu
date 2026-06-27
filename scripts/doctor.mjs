import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const warnings = [];
const notes = [];

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path) {
  return existsSync(join(root, path));
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function run(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function parseNodeMajor(version) {
  return Number.parseInt(version.split(".")[0] ?? "0", 10);
}

function registryHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

console.log("qitu doctor\n");

const packageJson = JSON.parse(readText("package.json"));
const workspace = readText("pnpm-workspace.yaml");
const npmrc = exists(".npmrc") ? readText(".npmrc") : "";
const legacyImportAdapterName = "Domain" + "ImportAdapter";

const nodeMajor = parseNodeMajor(process.versions.node);
warn(
  nodeMajor >= 24,
  `Node ${process.version} works for scripts, but Node 24+ is the recommended baseline.`,
);

const pnpmVersion = run("pnpm", ["--version"]);
if (pnpmVersion) {
  const expected = packageJson.packageManager?.replace("pnpm@", "");
  warn(
    pnpmVersion === expected,
    `pnpm version is ${pnpmVersion}; packageManager expects ${expected}.`,
  );
} else {
  warnings.push(
    "pnpm is not available on PATH. `vp install` may bootstrap it, but direct pnpm commands will fail.",
  );
}

const vpVersion = run("vp", ["--version"]);
check(
  Boolean(vpVersion),
  "`vp` is not available on PATH. Run through Vite+ or install dependencies first.",
);

const wranglerVersion = run("wrangler", ["--version"]);
warn(
  Boolean(wranglerVersion),
  "wrangler is not available on PATH. Cloudflare dev/typegen commands need it after install.",
);

check(workspace.includes("examples/*"), "pnpm-workspace.yaml must include examples/*.");
check(!workspace.includes("domains/*"), "pnpm-workspace.yaml must not require domains/*.");
check(!exists("domains"), "Top-level domains/ should not exist in the reusable starter.");
check(
  exists("examples/import-review"),
  "examples/import-review should exist as the boundary example.",
);
check(
  exists("templates/feature"),
  "templates/feature should exist as the copyable feature skeleton.",
);
check(
  exists("templates/app/manifest.json"),
  "templates/app/manifest.json should exist as the copy manifest for new apps.",
);

check(exists("docs/setup.md"), "docs/setup.md is missing.");
check(exists("docs/capability-matrix.md"), "docs/capability-matrix.md is missing.");
check(exists("docs/troubleshooting.md"), "docs/troubleshooting.md is missing.");
check(exists(".env.example"), ".env.example is missing.");

const importPipeline = readText("packages/import-pipeline/src/index.ts");
check(
  !importPipeline.includes(legacyImportAdapterName),
  "packages/import-pipeline must expose ImportFeatureAdapter, not the legacy adapter name.",
);

check(!npmrc.includes("_authToken"), ".npmrc must not contain registry auth tokens.");
if (npmrc.includes("registry=")) {
  warnings.push(
    ".npmrc sets a registry. Keep public starter templates registry-neutral unless this is intentional.",
  );
}

if (process.env.NPM_CONFIG_REGISTRY) {
  notes.push(
    `NPM_CONFIG_REGISTRY is set to host ${registryHost(process.env.NPM_CONFIG_REGISTRY)}.`,
  );
}

if (vpVersion) notes.push(`vp: ${vpVersion}`);
if (wranglerVersion) notes.push(`wrangler: ${wranglerVersion.split("\n")[0]}`);
if (pnpmVersion) notes.push(`pnpm: ${pnpmVersion}`);
notes.push(`node: ${process.version}`);

for (const note of notes) console.log(`note: ${note}`);
for (const warning of warnings) console.warn(`warn: ${warning}`);
for (const error of errors) console.error(`error: ${error}`);

if (errors.length > 0) {
  console.error(`\nDoctor failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log("\nDoctor passed.");

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function text(path) {
  return readFileSync(join(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function collectSourceFiles(path, predicate) {
  const base = join(root, path);
  const files = [];

  function collect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        collect(entryPath);
        continue;
      }

      const projectPath = relative(root, entryPath);
      if (predicate(projectPath)) {
        files.push(projectPath);
      }
    }
  }

  collect(base);
  return files;
}

function extractObjectBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Missing marker: ${marker}`);
  }

  const start = source.indexOf("{", markerIndex);
  if (start === -1) {
    throw new Error(`Missing object start after marker: ${marker}`);
  }

  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unclosed object after marker: ${marker}`);
}

function extractMessageKeys(source, marker) {
  const block = extractObjectBlock(source, marker);
  const keys = [];
  const pattern = /"([^"]+)":/g;
  let match;

  while ((match = pattern.exec(block))) {
    keys.push(match[1]);
  }

  return keys;
}

const packageI18n = text("packages/i18n/src/index.ts");
const webMessages = text("apps/web/src/i18n/messages.ts");
const webRuntimeFiles = collectSourceFiles("apps/web/src", (path) => {
  return /\.(ts|tsx)$/.test(path) && path !== "apps/web/src/i18n/messages.ts";
});
const webRuntimeSource = webRuntimeFiles.map((path) => text(path)).join("\n");
const packageJson = JSON.parse(text("package.json"));
const appTemplateManifest = JSON.parse(text("templates/app/manifest.json"));

for (const forbidden of [
  "react",
  "ReactNode",
  "document.",
  "window.",
  "apps/",
  "Reviewer access",
  "Accept invitation",
  "Source files",
  "Review console",
]) {
  assert(
    !packageI18n.includes(forbidden),
    `packages/i18n must not depend on app/runtime concerns or web copy: ${forbidden}`,
  );
}

assert(
  packageI18n.includes("Intl.PluralRules") && packageI18n.includes("Intl.RelativeTimeFormat"),
  "packages/i18n must expose plural and relative-time primitives.",
);
assert(
  packageI18n.includes("localeCandidatesFromAcceptLanguage") &&
    packageI18n.includes("resolveLocale"),
  "packages/i18n must expose reusable locale negotiation helpers.",
);

const enKeys = extractMessageKeys(webMessages, "export const enMessages = defineMessages(");
const zhKeys = extractMessageKeys(webMessages, "export const zhMessages");
const enKeySet = new Set(enKeys);
const zhKeySet = new Set(zhKeys);

for (const key of enKeys) {
  assert(zhKeySet.has(key), `zh-CN dictionary is missing key: ${key}`);
}

for (const key of zhKeys) {
  assert(enKeySet.has(key), `zh-CN dictionary includes unknown key: ${key}`);
}

const dynamicKeyPrefixes = ["role.", "status."];
const allowedUnusedKeys = new Set([
  "empty.noEvents",
  "empty.noEventsDescription",
  "error.requestFailed",
  "search.close",
]);

for (const key of enKeys) {
  if (dynamicKeyPrefixes.some((prefix) => key.startsWith(prefix))) continue;
  if (allowedUnusedKeys.has(key)) continue;

  assert(
    webRuntimeSource.includes(`"${key}"`),
    `web message key is not used outside messages.ts: ${key}`,
  );
}

for (const phrase of [
  "Accept invitation",
  "Reset password",
  "Reviewer access",
  "Source files",
  "Process local queue",
  "Commit approved",
  "Members and invitations",
  "Audit timeline",
  "AI advisory",
  "Review console",
  "Staged records",
  "Event stream",
  "Upload selected",
  "Reject record",
  "Approve record",
  "Retry job",
]) {
  assert(
    !webRuntimeSource.includes(phrase),
    `visible English UI copy must come from the web dictionary, found hard-coded phrase: ${phrase}`,
  );
}

assert(
  existsSync(join(root, "apps/web/src/i18n/provider.tsx")),
  "web i18n provider must be split.",
);
assert(existsSync(join(root, "apps/web/src/i18n/locales.ts")), "web i18n locales must be split.");
assert(existsSync(join(root, "apps/web/src/i18n/messages.ts")), "web i18n messages must be split.");
assert(
  webRuntimeSource.includes("function LanguageSelector") &&
    webRuntimeSource.includes('role="menuitemradio"') &&
    !webRuntimeSource.includes("cycleLocale"),
  "web language control must present explicit locale choices instead of one-click cycling.",
);
assert(
  webRuntimeSource.includes("x-qitu-locale"),
  "web API client must send the current locale to the Worker.",
);

assert(
  text("apps/worker/src/locale.ts").includes("localeFromRequest") &&
    text("apps/worker/src/auth-routes.ts").includes("localeFromRequest") &&
    text("packages/email/src/index.ts").includes("locale?: string"),
  "Worker auth email paths must derive locale and pass it into email rendering.",
);
assert(
  appTemplateManifest.copy.includes("packages/i18n") &&
    appTemplateManifest.copy.includes("scripts/i18n-check.mjs"),
  "app template manifest must copy the i18n package and check.",
);
assert(
  packageJson.scripts.smoke.includes("i18n-check.mjs"),
  "smoke script must run the i18n invariant check.",
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`i18n check: ${failure}`);
  }
  console.error(`i18n checks failed with ${failures.length} failure(s).`);
  process.exit(1);
}

console.log("i18n checks passed.");

export const cleanupPaths = [
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

export function createReplacements(options) {
  return [
    replacement("@qitu/", `${options.namespace}/`, "package namespace"),
    replacement('"name": "qitu"', `"name": "${options.appName}"`, "root package name"),
    replacement("qitu_session", options.cookieName, "session cookie name"),
    replacement("qitu-worker", options.workerName, "Worker name"),
    replacement("qitu-dev", `${options.appName}-dev`, "local Cloudflare resource names"),
    replacement("qitu-preview", `${options.appName}-preview`, "preview Cloudflare resource names"),
    replacement(
      "qitu-production",
      `${options.appName}-production`,
      "production Cloudflare resource names",
    ),
    replacement("qitu-source-files", `${options.appName}-source-files`, "R2 bucket name prefix"),
    replacement("qitu-import-jobs", `${options.appName}-import-jobs`, "Queue name prefix"),
    replacement(
      "PUBLIC_APP_NAME=qitu",
      `PUBLIC_APP_NAME=${options.appTitle}`,
      "public app name env",
    ),
  ];
}

function replacement(from, to, label) {
  return { from, label, to };
}

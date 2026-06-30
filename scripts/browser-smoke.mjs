import { spawn } from "node:child_process";
import { createServer } from "node:net";
import process from "node:process";
import { chromium, expect } from "@playwright/test";

const root = process.cwd();
const webUrl = "http://localhost:5173";
const workerPort = process.env.QITU_WORKER_PORT ?? (await findOpenPort());
const workerUrl = `http://127.0.0.1:${workerPort}`;
const workerHealthUrl = `${workerUrl}/health`;
const vp = process.platform === "win32" ? "vp.cmd" : "vp";
const serverLog = [];
const maxLogLines = 160;
let stopping = false;

const server = spawn(vp, ["run", "dev:all"], {
  cwd: root,
  env: {
    ...process.env,
    CI: "1",
    QITU_WORKER_ORIGIN: workerUrl,
    QITU_WORKER_PORT: workerPort,
  },
  stdio: ["ignore", "pipe", "pipe"],
  shell: false,
});

server.stdout.on("data", (chunk) => rememberLog(chunk));
server.stderr.on("data", (chunk) => rememberLog(chunk));
server.on("exit", (code, signal) => {
  if (!stopping && code !== null && code !== 0) {
    console.error(`dev:all exited with code ${code}.`);
    dumpServerLog();
  }
  if (!stopping && signal) {
    console.error(`dev:all exited with signal ${signal}.`);
    dumpServerLog();
  }
});

try {
  await Promise.all([waitForHttp(webUrl), waitForHttp(workerHealthUrl)]);
  await runBrowserSmoke();
  console.log("Browser smoke passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  dumpServerLog();
  process.exitCode = 1;
} finally {
  await stopServer();
  process.exit(process.exitCode ?? 0);
}

async function runBrowserSmoke() {
  const browser = await launchChromium();
  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 960,
    },
  });
  const page = await context.newPage();

  try {
    const runId = Date.now();
    const email = `reviewer-${runId}@example.com`;
    const filename = `browser-smoke-${runId}.txt`;
    const rejectedFilename = `browser-smoke-reject-${runId}.txt`;
    const failedFilename = `browser-smoke-failed-${runId}.json`;
    const content = `label,value\nbrowser-smoke-${runId},${runId}\n`;
    const rejectedContent = `label,value\nbrowser-smoke-reject-${runId},${runId + 1}\n`;
    const failedContent = `{"broken-${runId}":`;
    const initialPassword = "correct horse battery staple";
    const resetPassword = "correct horse battery staple reset";
    const invitation = await postWorkerJson("/api/bootstrap/invitations", {
      email,
      role: "reviewer",
    });

    await page.goto(invitation.inviteUrl, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: "Accept invitation" })).toBeVisible();
    await page
      .getByRole("button", { name: /Choose language/ })
      .first()
      .click();
    await expect(page.getByRole("menu", { name: "Language" })).toBeVisible();
    await page.getByRole("menuitemradio", { name: "简体中文" }).click();
    await expect(page.getByRole("heading", { name: "接受邀请" })).toBeVisible();
    await page
      .getByRole("button", { name: /选择语言/ })
      .first()
      .click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Accept invitation" })).toBeVisible();
    await page.getByLabel("Display name", { exact: true }).fill("Browser Smoke");
    await page.getByLabel("Password", { exact: true }).fill(initialPassword);
    await page.getByRole("button", { name: "Accept invitation" }).click();

    await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();

    const reset = await postWorkerJson("/api/auth/password-reset/request", {
      email,
    });
    await page.goto(reset.resetUrl, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill(resetPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to qitu" })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(resetPassword);
    await page.locator("form").getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();

    await page.goto(`${webUrl}/workspace/reviews`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Review console" })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: "text/plain",
      buffer: Buffer.from(content),
    });
    await page.getByRole("button", { name: "Upload selected" }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(escapeRegExp(filename)) }),
    ).toBeVisible();

    const drainButton = page.getByRole("button", { name: "Process local queue" });
    await expect(drainButton).toBeVisible();
    await drainButton.click();

    await expect(
      page.getByText("Record was staged and requires human review before commit.", {
        exact: true,
      }),
    ).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByText("This advisory is informational", { exact: false })).toBeVisible();
    await expect(
      page.getByText("local/deterministic-review-summary", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("suggested", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("confirmed", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ai_advisory.confirmed", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Approve record", exact: true }).click();
    await expect(
      page.getByRole("table").getByText("approved", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Commit approved", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Commit approved", exact: true }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(`${escapeRegExp(filename)}.*committed`) }),
    ).toBeVisible();
    await expect(page.getByText("import_job.committed", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("import_review.record_committed", { exact: true }).first(),
    ).toBeVisible();

    await page.goto(`${webUrl}/settings/audit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Audit timeline" })).toBeVisible();
    await page.getByLabel("Action", { exact: true }).fill("import_job.committed");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByText("import_job.committed", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Event details" })).toBeVisible();

    await page.goto(`${webUrl}/workspace/reviews`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: rejectedFilename,
      mimeType: "text/plain",
      buffer: Buffer.from(rejectedContent),
    });
    await page.getByRole("button", { name: "Upload selected" }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(escapeRegExp(rejectedFilename)) }),
    ).toBeVisible();

    await page.goto(`${webUrl}/workspace/imports`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Job diagnostics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Event stream" })).toBeVisible();
    await expect(page.getByText("import_job.queued", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Content hash", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/sha256:/).first()).toBeVisible();
    const committedImportRow = page
      .locator(".qitu-surface-subtle")
      .filter({ hasText: filename })
      .filter({ has: page.getByRole("button", { name: "Reviews" }) })
      .first();
    await committedImportRow.getByRole("button", { name: "Reviews" }).click();
    await expect(page.getByRole("heading", { name: "Review console" })).toBeVisible();
    await expect(
      page
        .getByRole("table")
        .getByText(new RegExp(`label: ${escapeRegExp(`browser-smoke-${runId}`)}`)),
    ).toBeVisible();

    await page.getByRole("button", { name: new RegExp(escapeRegExp(rejectedFilename)) }).click();
    await drainButton.click();
    await expect(
      page.getByText("Record was staged and requires human review before commit.", {
        exact: true,
      }),
    ).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "Reject record", exact: true }).click();
    await expect(
      page.getByRole("table").getByText("rejected", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Commit approved", exact: true })).toBeDisabled();
    await expect(
      page.getByText("import_review.record_rejected", { exact: true }).first(),
    ).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: failedFilename,
      mimeType: "application/json",
      buffer: Buffer.from(failedContent),
    });
    await page.getByRole("button", { name: "Upload selected" }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(escapeRegExp(failedFilename)) }),
    ).toBeVisible();
    await drainButton.click();
    await page.goto(`${webUrl}/workspace/imports`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Job diagnostics" })).toBeVisible();
    await expect(page.getByText("Failure class", { exact: true })).toBeVisible();
    await expect(page.getByText("processing", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Recovery path", { exact: true })).toBeVisible();
    await expect(page.getByText("Retry candidate", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Inspect Worker logs and source content first.", { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry job" }).first()).toBeVisible();

    const adminEmail = `admin-${runId}@example.com`;
    const managedEmail = `managed-${runId}@example.com`;
    await postWorkerJson("/api/bootstrap/local-admin", {
      email: adminEmail,
      displayName: "Browser Admin",
      password: initialPassword,
    });
    await context.clearCookies();
    await page.goto(`${webUrl}/login`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByLabel("Email", { exact: true }).fill(adminEmail);
    await page.getByLabel("Password", { exact: true }).fill(initialPassword);
    await page.locator("form").getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();

    await page.goto(`${webUrl}/settings/members`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Members and invitations" })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(managedEmail);
    await page.getByRole("button", { name: "Create invitation" }).click();
    const managedInvitationRow = page
      .locator(".qitu-surface-subtle")
      .filter({ hasText: managedEmail })
      .first();
    await expect(managedInvitationRow).toBeVisible();
    await managedInvitationRow
      .getByRole("button", {
        name: new RegExp(`Revoke invitation for ${escapeRegExp(managedEmail)}`),
      })
      .click();
    await expect(managedInvitationRow.getByText("revoked", { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await browser.close();
  }
}

async function postWorkerJson(path, body) {
  const response = await fetch(`${workerUrl}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }

  return response.json();
}

async function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a local Worker port.")));
        return;
      }

      const port = String(address.port);
      server.close(() => resolve(port));
    });
  });
}

async function launchChromium() {
  try {
    return await chromium.launch({
      headless: process.env.QITU_BROWSER_HEADFUL !== "1",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        "Unable to launch Playwright Chromium.",
        "Run `vp exec playwright install chromium` once on this machine, then retry `vp run smoke:browser`.",
        message,
      ].join("\n"),
    );
  }
}

async function waitForHttp(url, timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for ${url}.${lastError ? ` Last error: ${errorMessage(lastError)}` : ""}`,
  );
}

function rememberLog(chunk) {
  for (const line of chunk.toString("utf8").split(/\r?\n/)) {
    if (!line) continue;
    serverLog.push(line);
    if (serverLog.length > maxLogLines) {
      serverLog.shift();
    }
  }
}

function dumpServerLog() {
  if (serverLog.length === 0) {
    return;
  }

  console.error("\nRecent dev server output:");
  for (const line of serverLog) {
    console.error(line);
  }
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }

  stopping = true;
  await signalAndWait("SIGINT", 3_000);
  await signalAndWait("SIGTERM", 2_000);
  await signalAndWait("SIGKILL", 1_000);
}

async function signalAndWait(signal, timeoutMs) {
  if (server.exitCode !== null || server.signalCode !== null || !server.pid) {
    return;
  }

  try {
    process.kill(server.pid, signal);
  } catch {
    return;
  }

  const exited = new Promise((resolve) => {
    server.once("exit", resolve);
  });
  await Promise.race([exited, delay(timeoutMs)]);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : JSON.stringify(error);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

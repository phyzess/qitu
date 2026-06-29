import { spawn } from "node:child_process";
import process from "node:process";
import { chromium, expect } from "@playwright/test";

const root = process.cwd();
const webUrl = "http://localhost:5173";
const workerHealthUrl = "http://127.0.0.1:8787/health";
const vp = process.platform === "win32" ? "vp.cmd" : "vp";
const serverLog = [];
const maxLogLines = 160;
let stopping = false;

const server = spawn(vp, ["run", "dev:all"], {
  cwd: root,
  env: {
    ...process.env,
    CI: "1",
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
    const content = `label,value\nbrowser-smoke-${runId},${runId}\n`;
    const rejectedContent = `label,value\nbrowser-smoke-reject-${runId},${runId + 1}\n`;
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

    await expect(page.getByRole("heading", { name: "Review console" })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();

    const reset = await postWorkerJson("/api/auth/password-reset/request", {
      email,
    });
    await page.goto(reset.resetUrl, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill(resetPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("heading", { name: "Reviewer access" })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(resetPassword);
    await page.locator("form").getByRole("button", { name: "Login" }).click();
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

    await page.locator('input[type="file"]').setInputFiles({
      name: rejectedFilename,
      mimeType: "text/plain",
      buffer: Buffer.from(rejectedContent),
    });
    await page.getByRole("button", { name: "Upload selected" }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(escapeRegExp(rejectedFilename)) }),
    ).toBeVisible();

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
  } finally {
    await context.close();
    await browser.close();
  }
}

async function postWorkerJson(path, body) {
  const response = await fetch(`http://127.0.0.1:8787${path}`, {
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

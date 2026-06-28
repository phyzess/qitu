import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const require = createRequire(import.meta.url);
const vitePath = require.resolve("vite", {
  paths: [join(root, "apps", "web")],
});
const { createServer } = await import(pathToFileURL(vitePath));

const aliases = [
  "ai-advisory",
  "audit",
  "auth",
  "charts",
  "config",
  "db",
  "design-system",
  "email",
  "files",
  "import-pipeline",
  "jobs",
  "rbac",
  "testing",
  "ui",
].map((name) => ({
  find: `@qitu/${name}`,
  replacement: join(root, "packages", name, "src", "index.ts"),
}));

async function main() {
  const server = await createServer({
    configFile: false,
    root,
    logLevel: "silent",
    server: {
      middlewareMode: true,
    },
    resolve: {
      alias: aliases,
    },
  });

  try {
    const workerModule = await server.ssrLoadModule("/apps/worker/src/index.ts");
    const worker = workerModule.default;
    const env = await createTestEnv();
    const client = createClient(worker, env);

    await expectStatus(await client.post("/api/source-files", "unauthorized"), 401);

    const viewerClient = createClient(worker, env);
    const viewerBootstrap = await viewerClient.json("/api/bootstrap/invitations", {
      method: "POST",
      body: JSON.stringify({
        email: "viewer@example.com",
        role: "viewer",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const viewerAccepted = await viewerClient.json(
      `/api/invitations/${viewerBootstrap.inviteToken}/accept`,
      {
        method: "POST",
        body: JSON.stringify({
          displayName: "Viewer",
          password: "correct horse battery staple",
        }),
        headers: {
          "content-type": "application/json",
        },
      },
    );

    assert(viewerAccepted.user.role === "viewer", "viewer invite creates viewer role");
    await expectStatus(
      await viewerClient.post("/api/source-files", "label,value\nNope,1\n", {
        headers: {
          "content-type": "text/plain",
          "x-filename": "viewer-denied.txt",
          "x-workspace-id": "default",
        },
      }),
      403,
    );

    const rbacAudit = await env.DB.prepare(
      "SELECT action, subject_id FROM audit_events WHERE action = 'rbac.denied' LIMIT 1",
    ).first();
    assert(rbacAudit?.subject_id === "source_file:upload", "rbac denial is audited");

    await expectStatus(await viewerClient.request("/api/users"), 403);

    const adminClient = createClient(worker, env);
    const adminBootstrap = await adminClient.json("/api/bootstrap/invitations", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        role: "admin",
      }),
      headers: {
        "content-type": "application/json",
      },
    });
    const adminAccepted = await adminClient.json(
      `/api/invitations/${adminBootstrap.inviteToken}/accept`,
      {
        method: "POST",
        body: JSON.stringify({
          displayName: "Admin",
          password: "correct horse battery staple",
        }),
        headers: {
          "content-type": "application/json",
        },
      },
    );
    assert(adminAccepted.user.role === "admin", "admin invite creates admin role");

    const managedInvitation = await adminClient.json("/api/invitations", {
      method: "POST",
      body: JSON.stringify({
        email: "managed-viewer@example.com",
        role: "viewer",
      }),
      headers: {
        "content-type": "application/json",
      },
    });
    assert(
      typeof managedInvitation.inviteToken === "string",
      "local authenticated invitation returns token",
    );

    const managedUsers = await adminClient.json("/api/users?limit=20");
    assert(
      managedUsers.users.some((user) => user.email === "admin@example.com"),
      "admin can list users",
    );
    const managedInvitations = await adminClient.json("/api/invitations?limit=20");
    assert(
      managedInvitations.invitations.some(
        (invitation) => invitation.email === "managed-viewer@example.com",
      ),
      "admin can list invitations",
    );

    const demoClient = createClient(worker, env);
    const demoReviewer = await demoClient.json("/api/bootstrap/local-reviewer", {
      method: "POST",
      body: JSON.stringify({
        email: "local-demo@example.com",
        displayName: "Local Demo",
        password: "correct horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    assert(demoReviewer.created === true, "local demo reviewer bootstrap creates a user");
    assert(demoReviewer.user.role === "reviewer", "local demo reviewer uses reviewer role");

    const demoAdminClient = createClient(worker, env);
    const demoAdmin = await demoAdminClient.json("/api/bootstrap/local-admin", {
      method: "POST",
      body: JSON.stringify({
        email: "local-admin@example.com",
        displayName: "Local Admin",
        password: "correct horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    assert(demoAdmin.created === true, "local demo admin bootstrap creates a user");
    assert(demoAdmin.user.role === "admin", "local demo admin uses admin role");
    const demoAdminUsers = await demoAdminClient.json("/api/users?limit=20");
    assert(
      demoAdminUsers.users.some((user) => user.email === "local-admin@example.com"),
      "local demo admin can list users",
    );

    await demoClient.json("/api/auth/logout", {
      method: "POST",
    });

    const demoLogin = await demoClient.json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "local-demo@example.com",
        password: "correct horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    assert(demoLogin.user.email === "local-demo@example.com", "local demo credentials log in");

    const bootstrap = await client.json("/api/bootstrap/invitations", {
      method: "POST",
      body: JSON.stringify({
        email: "reviewer@example.com",
        role: "reviewer",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    assert(typeof bootstrap.inviteToken === "string", "bootstrap returns invite token");
    assert(bootstrap.delivery === "stored", "bootstrap stores local invitation email");

    const accepted = await client.json(`/api/invitations/${bootstrap.inviteToken}/accept`, {
      method: "POST",
      body: JSON.stringify({
        displayName: "Reviewer",
        password: "correct horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    assert(accepted.user.email === "reviewer@example.com", "invite accept creates reviewer");
    assert(accepted.user.role === "reviewer", "invite accept preserves reviewer role");

    await client.json("/api/auth/logout", {
      method: "POST",
    });

    const login = await client.json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "reviewer@example.com",
        password: "correct horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    assert(login.user.email === "reviewer@example.com", "login returns reviewer");
    assert(login.user.role === "reviewer", "login preserves reviewer role");

    const reset = await client.json("/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({
        email: "reviewer@example.com",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    assert(typeof reset.resetToken === "string", "local password reset returns reset token");
    assert(reset.delivery === "stored", "password reset stores local email");

    const resetEmail = await env.DB.prepare(
      "SELECT status FROM email_messages WHERE kind = 'password_reset' LIMIT 1",
    ).first();
    assert(resetEmail?.status === "stored", "password reset email metadata is persisted");

    await client.json("/api/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({
        token: reset.resetToken,
        password: "reset horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const sessionAfterReset = await client.json("/api/auth/me");
    assert(sessionAfterReset.user === null, "password reset revokes the active session");

    await expectStatus(
      await client.request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "reviewer@example.com",
          password: "correct horse battery staple",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      401,
    );

    const loginAfterReset = await client.json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "reviewer@example.com",
        password: "reset horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    assert(loginAfterReset.user.email === "reviewer@example.com", "new password logs in");

    const upload = await client.json("/api/source-files", {
      method: "POST",
      body: "label,value\nSample Record,1.1992\n",
      headers: {
        "content-type": "text/plain",
        "x-filename": "fixture-import.txt",
        "x-workspace-id": "default",
      },
    });

    assert(upload.status === "queued", "upload creates queued import job");
    assert(env.SOURCE_FILES.has(upload.objectKey), "upload writes R2 object");
    assert(env.IMPORT_JOBS.messages.length === 1, "upload dispatches queue message");

    const duplicate = await client.json("/api/source-files", {
      method: "POST",
      body: "label,value\nSample Record,1.1992\n",
      headers: {
        "content-type": "text/plain",
        "x-filename": "fixture-import.txt",
        "x-workspace-id": "default",
      },
    });

    assert(duplicate.duplicate === true, "duplicate upload is idempotent");
    assert(
      env.IMPORT_JOBS.messages.length === 1,
      "duplicate upload does not dispatch queue message",
    );

    await worker.queue(
      {
        messages: env.IMPORT_JOBS.messages.map((body) => ({ body })),
      },
      env,
    );

    const review = await client.json(`/api/import-jobs/${upload.importJobId}/review`);
    assert(
      review.job.status === "needs_review",
      `queue moves import job to needs_review, got ${review.job.status}: ${review.job.failureReason}`,
    );
    assert(review.records.length === 1, "queue creates staged review record");
    assert(review.issues.length === 1, "queue creates review issue");

    const advisory = await client.json(`/api/import-jobs/${upload.importJobId}/advisories`, {
      method: "POST",
    });
    assert(advisory.advisory.status === "suggested", "AI advisory starts as suggested");
    assert(
      advisory.advisory.output?.humanGate === "Reviewer approval is still required before commit.",
      "AI advisory records the human review gate",
    );

    const advisoryList = await client.json(`/api/import-jobs/${upload.importJobId}/advisories`);
    assert(advisoryList.advisories.length === 1, "AI advisory list returns generated advisory");

    const confirmedAdvisory = await client.json(
      `/api/import-jobs/${upload.importJobId}/advisories/${advisory.advisory.id}/confirm`,
      {
        method: "POST",
      },
    );
    assert(confirmedAdvisory.advisory.status === "confirmed", "AI advisory can be human-confirmed");

    const [record] = review.records;
    const approved = await client.json(
      `/api/import-jobs/${upload.importJobId}/staged-records/${record.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          note: "Looks good.",
        }),
        headers: {
          "content-type": "application/json",
        },
      },
    );

    assert(approved.record.reviewStatus === "approved", "approve updates staged record");

    const commit = await client.json(`/api/import-jobs/${upload.importJobId}/commit`, {
      method: "POST",
    });

    assert(commit.status === "committed", "commit returns committed status");
    assert(commit.committedRecords.length === 1, "commit writes committed record");
    assert(
      typeof commit.committedRecords[0]?.payload?.committedAt === "string",
      "commit payload comes from the adapter commitApproved handler",
    );

    const commitAgain = await client.json(`/api/import-jobs/${upload.importJobId}/commit`, {
      method: "POST",
    });

    assert(commitAgain.duplicate === true, "second commit is idempotent");

    const invalidUpload = await client.json("/api/source-files", {
      method: "POST",
      body: "label,value\nBad NAV,not-a-number\n",
      headers: {
        "content-type": "text/plain",
        "x-filename": "fixture-invalid-number.txt",
        "x-workspace-id": "default",
      },
    });
    const invalidMessage = env.IMPORT_JOBS.messages.at(-1);
    assert(invalidMessage?.jobId === invalidUpload.importJobId, "invalid fixture is queued");

    await worker.queue(
      {
        messages: [{ body: invalidMessage }],
      },
      env,
    );

    const invalidReview = await client.json(`/api/import-jobs/${invalidUpload.importJobId}/review`);
    const invalidIssueCodes = new Set(invalidReview.issues.map((issue) => issue.code));
    assert(invalidReview.job.status === "needs_review", "invalid number stays in review");
    assert(invalidReview.records.length === 1, "invalid fixture stages one record");
    assert(
      invalidReview.records[0]?.payload?.normalizedLabel === "bad nav",
      "invalid fixture still normalizes staged payload for review",
    );
    assert(
      invalidIssueCodes.has("manual_review_required") && invalidIssueCodes.has("invalid_number"),
      "invalid fixture records both manual review and adapter validation issues",
    );
    await expectStatus(
      await client.request(`/api/import-jobs/${invalidUpload.importJobId}/commit`, {
        method: "POST",
      }),
      409,
    );

    const jsonUpload = await client.json("/api/source-files", {
      method: "POST",
      body: JSON.stringify({
        alpha: 1,
        beta: {
          enabled: true,
        },
      }),
      headers: {
        "content-type": "application/json",
        "x-filename": "fixture-json-records.json",
        "x-workspace-id": "default",
      },
    });
    const jsonMessage = env.IMPORT_JOBS.messages.at(-1);
    assert(jsonMessage?.jobId === jsonUpload.importJobId, "json fixture is queued");

    await worker.queue(
      {
        messages: [{ body: jsonMessage }],
      },
      env,
    );

    const jsonReview = await client.json(`/api/import-jobs/${jsonUpload.importJobId}/review`);
    assert(jsonReview.job.adapterId === "starter.json-records", "json job uses JSON adapter");
    assert(jsonReview.job.jobKind === "starter.json-records", "json job stores JSON job kind");
    assert(jsonReview.job.status === "needs_review", "json job reaches review");
    assert(jsonReview.records.length === 2, "json adapter creates staged records");

    const [jsonRecord] = jsonReview.records;
    const jsonApproved = await client.json(
      `/api/import-jobs/${jsonUpload.importJobId}/staged-records/${jsonRecord.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          note: "JSON adapter path.",
        }),
        headers: {
          "content-type": "application/json",
        },
      },
    );
    assert(jsonApproved.record.reviewStatus === "approved", "json record can be approved");

    const jsonCommit = await client.json(`/api/import-jobs/${jsonUpload.importJobId}/commit`, {
      method: "POST",
    });
    assert(jsonCommit.status === "committed", "json commit returns committed status");
    assert(jsonCommit.committedRecords.length === 1, "json commit writes approved record only");
    assert(
      typeof jsonCommit.committedRecords[0]?.payload?.commitKey === "string",
      "json commit payload comes from JSON adapter commitApproved handler",
    );

    const retryUploadBody = "label,value\nRetry NAV,2.001\n";
    const retryUpload = await client.json("/api/source-files", {
      method: "POST",
      body: retryUploadBody,
      headers: {
        "content-type": "text/plain",
        "x-filename": "fixture-retry.txt",
        "x-workspace-id": "default",
      },
    });
    const firstRetryMessage = env.IMPORT_JOBS.messages.at(-1);
    assert(firstRetryMessage?.jobId === retryUpload.importJobId, "retry fixture is queued");

    await env.SOURCE_FILES.delete(retryUpload.objectKey);
    await worker.queue(
      {
        messages: [{ body: firstRetryMessage }],
      },
      env,
    );

    const failedJobs = await client.json("/api/import-jobs?limit=20");
    const failedJob = failedJobs.importJobs.find((job) => job.id === retryUpload.importJobId);
    assert(failedJob?.status === "failed", "missing source object marks import job failed");
    assert(failedJob.failureClass === "source_missing", "failed job stores failure class");

    await env.SOURCE_FILES.put(retryUpload.objectKey, retryUploadBody, {
      httpMetadata: {
        contentType: "text/plain",
      },
    });

    const retry = await client.json(`/api/import-jobs/${retryUpload.importJobId}/retry`, {
      method: "POST",
    });
    assert(retry.status === "queued", "retry route requeues a failed job");

    const secondRetryMessage = env.IMPORT_JOBS.messages.at(-1);
    assert(secondRetryMessage?.jobId === retryUpload.importJobId, "retry dispatches queue message");
    await worker.queue(
      {
        messages: [{ body: secondRetryMessage }],
      },
      env,
    );

    const retryReview = await client.json(`/api/import-jobs/${retryUpload.importJobId}/review`);
    assert(retryReview.job.status === "needs_review", "retried job reaches review");
    assert(retryReview.records.length === 1, "retried job stages records through adapter");

    const sourceFiles = await client.json("/api/source-files");
    assert(sourceFiles.sourceFiles.length === 4, "source file list is visible");

    const importJobs = await client.json("/api/import-jobs");
    assert(
      importJobs.importJobs.some((job) => job.status === "committed"),
      "import job list reflects commit",
    );

    const audit = await client.json("/api/audit-events?limit=100");
    const actions = new Set(audit.auditEvents.map((event) => event.action));
    for (const action of [
      "invitation.created",
      "invitation.accepted",
      "auth.login_succeeded",
      "auth.password_reset_requested",
      "auth.password_reset_succeeded",
      "source_file.uploaded",
      "import_job.queued",
      "import_review.record_staged",
      "import_review.record_approved",
      "import_review.record_committed",
      "import_job.committed",
      "import_job.source_missing",
      "import_job.retry_queued",
      "ai_advisory.generated",
      "ai_advisory.confirmed",
      "rbac.denied",
    ]) {
      assert(actions.has(action), `audit list includes ${action}`);
    }

    console.log("Worker integration passed.");
  } finally {
    await server.close();
  }
}

async function createTestEnv() {
  const database = new DatabaseSync(":memory:");
  const migrationsPath = join(root, "apps", "worker", "migrations");
  const migrationNames = (await readdir(migrationsPath))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const migrationName of migrationNames) {
    database.exec(readFileSync(join(migrationsPath, migrationName), "utf8"));
  }

  const sourceFiles = new FakeR2Bucket();
  const importJobs = new FakeQueue();

  return {
    APP_ENV: "local",
    PUBLIC_APP_NAME: "qitu",
    PUBLIC_APP_URL: "http://localhost:5173",
    MAIL_FROM: "noreply@example.com",
    DB: new FakeD1Database(database),
    EMAIL: new FakeEmailSender(),
    SOURCE_FILES: sourceFiles,
    IMPORT_JOBS: importJobs,
  };
}

function createClient(worker, env) {
  const origin = "https://qitu.test";
  const jar = new Map();

  async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (jar.size > 0) {
      headers.set(
        "cookie",
        Array.from(jar.entries())
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      );
    }

    const response = await worker.fetch(
      new Request(new URL(path, origin), {
        ...options,
        headers,
      }),
      env,
      {
        waitUntil() {},
        passThroughOnException() {},
      },
    );

    storeCookies(jar, response);
    return response;
  }

  return {
    request,
    post(path, body, options = {}) {
      return request(path, {
        ...options,
        method: "POST",
        body,
      });
    },
    async json(path, options = {}) {
      const response = await request(path, options);
      if (!response.ok) {
        throw new Error(`${options.method ?? "GET"} ${path} failed with ${response.status}`);
      }
      return response.json();
    },
  };
}

function storeCookies(jar, response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    return;
  }

  for (const cookie of splitSetCookie(setCookie)) {
    const [pair] = cookie.split(";");
    const separator = pair.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!name) {
      continue;
    }

    if (value) {
      jar.set(name, value);
    } else {
      jar.delete(name);
    }
  }
}

function splitSetCookie(header) {
  return header.split(/,(?=\s*[^;,]+=)/g).map((value) => value.trim());
}

async function expectStatus(response, status) {
  assert(response.status === status, `expected ${status}, got ${response.status}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`integration: ${message}`);
  }
}

class FakeD1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new FakeD1PreparedStatement(this.database, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }
}

class FakeD1PreparedStatement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new FakeD1PreparedStatement(this.database, this.sql, params);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.params) ?? null;
  }

  async all() {
    return {
      results: this.database.prepare(this.sql).all(...this.params),
      success: true,
      meta: {},
    };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: result.changes,
        last_row_id: result.lastInsertRowid,
      },
    };
  }
}

class FakeR2Bucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    const bytes = await toUint8Array(value);
    this.objects.set(key, {
      key,
      bytes,
      size: bytes.byteLength,
      httpMetadata: options.httpMetadata,
      customMetadata: options.customMetadata,
    });
  }

  async get(key) {
    const object = this.objects.get(key);
    if (!object) {
      return null;
    }

    return {
      ...object,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(object.bytes);
          controller.close();
        },
      }),
    };
  }

  async delete(key) {
    this.objects.delete(key);
  }

  has(key) {
    return this.objects.has(key);
  }
}

class FakeQueue {
  constructor() {
    this.messages = [];
  }

  async send(message) {
    this.messages.push(message);
  }
}

class FakeEmailSender {
  constructor() {
    this.messages = [];
  }

  async send(message) {
    this.messages.push(message);
    return {
      id: `email-${this.messages.length}`,
    };
  }
}

async function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  if (value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }

  throw new Error("Unsupported R2 object body.");
}

await main();

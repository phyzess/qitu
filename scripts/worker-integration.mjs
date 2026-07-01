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
    await testInboundEmailIntake(worker);

    const previewEnv = await createTestEnv({
      APP_ENV: "preview",
      PUBLIC_APP_URL: "https://preview.example.com",
    });
    const previewClient = createClient(worker, previewEnv);
    await expectApiError(
      await previewClient.request("/api/bootstrap/invitations", {
        method: "POST",
        body: JSON.stringify({
          email: "preview-bootstrap@example.com",
          role: "admin",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      403,
      "bootstrap_disabled",
    );
    await expectApiError(
      await previewClient.request("/api/bootstrap/local-reviewer", {
        method: "POST",
        body: JSON.stringify({
          email: "preview-local-reviewer@example.com",
          password: "correct horse battery staple",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      403,
      "bootstrap_disabled",
    );
    await expectApiError(
      await previewClient.request("/api/bootstrap/local-admin", {
        method: "POST",
        body: JSON.stringify({
          email: "preview-local-admin@example.com",
          password: "correct horse battery staple",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      403,
      "bootstrap_disabled",
    );

    const failingEmailEnv = await createTestEnv({
      EMAIL: new FakeEmailSender({ fail: true }),
      EMAIL_DELIVERY_MODE: "send",
      MAIL_FROM: "noreply@phyzess.me",
    });
    const failingEmailAdmin = createClient(worker, failingEmailEnv);
    await failingEmailAdmin.json("/api/bootstrap/local-admin", {
      method: "POST",
      body: JSON.stringify({
        email: "failing-email-admin@example.com",
        password: "correct horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
      },
    });
    const failedInviteDelivery = await failingEmailAdmin.json("/api/invitations", {
      method: "POST",
      body: JSON.stringify({
        email: "failed-delivery@example.com",
        role: "viewer",
      }),
      headers: {
        "content-type": "application/json",
      },
    });
    assert(
      failedInviteDelivery.invitation.status === "pending" &&
        failedInviteDelivery.delivery === "failed" &&
        failedInviteDelivery.emailDelivery.errorMessage.includes("Simulated email failure"),
      "invitation is created and marks failed email delivery",
    );
    const failedEmailLedger = await failingEmailEnv.DB.prepare(
      "SELECT status, error_message FROM email_messages WHERE kind = 'invitation' LIMIT 1",
    ).first();
    assert(
      failedEmailLedger?.status === "failed" &&
        failedEmailLedger.error_message.includes("Simulated email failure"),
      "failed invitation email is recorded in email_messages",
    );

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
    assert(managedInvitation.emailDelivery.status === "stored", "invite returns email delivery");

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
    assert(
      managedInvitations.invitations.some(
        (invitation) =>
          invitation.email === "managed-viewer@example.com" &&
          invitation.latestEmailStatus === "stored",
      ),
      "invitation list includes latest email delivery status",
    );
    const resentManagedInvitation = await adminClient.json(
      `/api/invitations/${managedInvitation.invitation.id}/resend`,
      {
        method: "POST",
      },
    );
    assert(
      resentManagedInvitation.delivery === "stored" &&
        typeof resentManagedInvitation.inviteToken === "string",
      "admin can resend pending invitation and receive a local token",
    );
    const resendAudit = await env.DB.prepare(
      "SELECT action, subject_id FROM audit_events WHERE action = 'invitation.resent' AND subject_id = ? LIMIT 1",
    )
      .bind(managedInvitation.invitation.id)
      .first();
    assert(resendAudit?.subject_id === managedInvitation.invitation.id, "resend is audited");

    const revokedManagedInvitation = await adminClient.json(
      `/api/invitations/${managedInvitation.invitation.id}/revoke`,
      {
        method: "POST",
      },
    );
    assert(
      revokedManagedInvitation.invitation.status === "revoked",
      "admin can revoke pending invitation",
    );
    assert(
      typeof revokedManagedInvitation.invitation.revokedAt === "string",
      "revoked invitation returns revoked timestamp",
    );
    const invitationsAfterRevoke = await adminClient.json("/api/invitations?limit=20");
    assert(
      invitationsAfterRevoke.invitations.some(
        (invitation) =>
          invitation.id === managedInvitation.invitation.id && invitation.status === "revoked",
      ),
      "revoked invitation is visible in invitation list",
    );
    const revokeAudit = await env.DB.prepare(
      "SELECT action, subject_id FROM audit_events WHERE action = 'invitation.revoked' AND subject_id = ? LIMIT 1",
    )
      .bind(managedInvitation.invitation.id)
      .first();
    assert(revokeAudit?.subject_id === managedInvitation.invitation.id, "revoke is audited");
    await expectStatus(
      await adminClient.request(`/api/invitations/${managedInvitation.invitation.id}/revoke`, {
        method: "POST",
      }),
      409,
    );
    const deletedRevokedInvitation = await adminClient.json(
      `/api/invitations/${managedInvitation.invitation.id}`,
      {
        method: "DELETE",
      },
    );
    assert(
      deletedRevokedInvitation.deletedInvitationId === managedInvitation.invitation.id,
      "admin can delete revoked invitation",
    );
    const deleteInvitationAudit = await env.DB.prepare(
      "SELECT action, subject_id FROM audit_events WHERE action = 'invitation.deleted' AND subject_id = ? LIMIT 1",
    )
      .bind(managedInvitation.invitation.id)
      .first();
    assert(
      deleteInvitationAudit?.subject_id === managedInvitation.invitation.id,
      "deleted invitation is audited",
    );

    const deleteMemberInvitation = await adminClient.json("/api/invitations", {
      method: "POST",
      body: JSON.stringify({
        email: "delete-member@example.com",
        role: "viewer",
      }),
      headers: {
        "content-type": "application/json",
      },
    });
    const deleteMemberClient = createClient(worker, env);
    const deleteMemberAccepted = await deleteMemberClient.json(
      `/api/invitations/${deleteMemberInvitation.inviteToken}/accept`,
      {
        method: "POST",
        body: JSON.stringify({
          displayName: "Delete Member",
          password: "correct horse battery staple",
        }),
        headers: {
          "content-type": "application/json",
        },
      },
    );
    await deleteMemberClient.json("/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({
        email: "delete-member@example.com",
      }),
      headers: {
        "content-type": "application/json",
      },
    });
    await expectStatus(
      await adminClient.request(`/api/users/${adminAccepted.user.id}`, {
        method: "DELETE",
      }),
      409,
    );
    const deletedMember = await adminClient.json(`/api/users/${deleteMemberAccepted.user.id}`, {
      method: "DELETE",
    });
    assert(deletedMember.ok === true, "admin can hard-delete a member");
    assert(
      !(await env.DB.prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
        .bind(deleteMemberAccepted.user.id)
        .first()),
      "hard delete removes user row",
    );
    assert(
      !(await env.DB.prepare("SELECT user_id FROM password_credentials WHERE user_id = ? LIMIT 1")
        .bind(deleteMemberAccepted.user.id)
        .first()),
      "hard delete removes password credentials",
    );
    assert(
      !(await env.DB.prepare("SELECT id FROM sessions WHERE user_id = ? LIMIT 1")
        .bind(deleteMemberAccepted.user.id)
        .first()),
      "hard delete removes sessions",
    );
    assert(
      !(await env.DB.prepare("SELECT id FROM password_reset_tokens WHERE user_id = ? LIMIT 1")
        .bind(deleteMemberAccepted.user.id)
        .first()),
      "hard delete removes password reset tokens",
    );
    const deletedUserAudit = await env.DB.prepare(
      "SELECT action, subject_id FROM audit_events WHERE action = 'user.deleted' AND subject_id = ? LIMIT 1",
    )
      .bind(deleteMemberAccepted.user.id)
      .first();
    assert(deletedUserAudit?.subject_id === deleteMemberAccepted.user.id, "delete is audited");

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
        displayName: "Operator",
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
      advisory.advisory.output?.humanGate === "Human confirmation is still required before commit.",
      "AI advisory records the human confirmation gate",
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
      body: "label,value\nBad Amount,not-a-number\n",
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
      invalidReview.records[0]?.payload?.normalizedLabel === "bad amount",
      "invalid fixture still normalizes staged payload for review",
    );
    assert(
      invalidIssueCodes.has("manual_review_required") && invalidIssueCodes.has("invalid_number"),
      "invalid fixture records both confirmation and adapter validation issues",
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
    assert(
      jsonCommit.status === "needs_review",
      "partial json commit keeps job in review while pending records remain",
    );
    assert(jsonCommit.committedRecords.length === 1, "json commit writes approved record only");
    assert(
      typeof jsonCommit.committedRecords[0]?.payload?.commitKey === "string",
      "json commit payload comes from JSON adapter commitApproved handler",
    );
    const jsonReviewAfterPartialCommit = await client.json(
      `/api/import-jobs/${jsonUpload.importJobId}/review`,
    );
    assert(
      jsonReviewAfterPartialCommit.job.status === "needs_review",
      "partial json commit persists needs_review status",
    );
    assert(
      jsonReviewAfterPartialCommit.records.some((record) => record.reviewStatus === "committed"),
      "partial json commit marks the approved record committed",
    );
    assert(
      jsonReviewAfterPartialCommit.records.some((record) => record.reviewStatus === "pending"),
      "partial json commit leaves undecided records pending",
    );
    const jsonCommitAgainWhilePending = await client.json(
      `/api/import-jobs/${jsonUpload.importJobId}/commit`,
      {
        method: "POST",
      },
    );
    assert(
      jsonCommitAgainWhilePending.duplicate === true &&
        jsonCommitAgainWhilePending.status === "needs_review",
      "duplicate partial json commit preserves derived job status",
    );
    const remainingJsonRecord = jsonReviewAfterPartialCommit.records.find(
      (record) => record.reviewStatus === "pending",
    );
    assert(Boolean(remainingJsonRecord), "json partial commit leaves one record to review");
    const jsonConfirmPending = await client.json(
      `/api/import-jobs/${jsonUpload.importJobId}/review/confirm-pending`,
      {
        method: "POST",
        body: JSON.stringify({
          note: "Finish JSON adapter path.",
        }),
        headers: {
          "content-type": "application/json",
        },
      },
    );
    assert(jsonConfirmPending.confirmedCount === 1, "batch confirm approves pending json record");
    assert(
      jsonConfirmPending.records.every((record) => record.reviewStatus === "approved"),
      "batch confirm returns approved staged records",
    );
    const jsonReviewAfterFinalApprove = await client.json(
      `/api/import-jobs/${jsonUpload.importJobId}/review`,
    );
    assert(
      jsonReviewAfterFinalApprove.job.status === "approved",
      "approving the remaining json record exposes approved rows for commit",
    );
    const finalJsonCommit = await client.json(`/api/import-jobs/${jsonUpload.importJobId}/commit`, {
      method: "POST",
    });
    assert(finalJsonCommit.status === "committed", "json job is committed after all rows finish");
    assert(finalJsonCommit.committedRecords.length === 1, "final json commit writes remaining row");

    const retryUploadBody = "label,value\nRetry Record,2.001\n";
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
    const committedAudit = await client.json("/api/audit-events?action=import_job.committed");
    assert(
      committedAudit.auditEvents.length > 0 &&
        committedAudit.auditEvents.every((event) => event.action === "import_job.committed"),
      "audit list can filter by action",
    );
    const actorAudit = await client.json(
      `/api/audit-events?actorId=${encodeURIComponent(loginAfterReset.user.id)}`,
    );
    assert(
      actorAudit.auditEvents.length > 0 &&
        actorAudit.auditEvents.every((event) => event.actor.id === loginAfterReset.user.id),
      "audit list can filter by actor id",
    );
    const subjectAudit = await client.json(
      `/api/audit-events?subjectKind=import_job&subjectId=${encodeURIComponent(upload.importJobId)}`,
    );
    assert(
      subjectAudit.auditEvents.length > 0 &&
        subjectAudit.auditEvents.every(
          (event) => event.subject.kind === "import_job" && event.subject.id === upload.importJobId,
        ),
      "audit list can filter by subject",
    );
    const latestAuditEvent = audit.auditEvents[0];
    const latestOccurredAt = Date.parse(latestAuditEvent.occurredAt);
    const auditWindowStart = new Date(latestOccurredAt - 1_000).toISOString();
    const auditWindowEnd = new Date(latestOccurredAt + 1_000).toISOString();
    const dateRangeAudit = await client.json(
      `/api/audit-events?occurredAfter=${encodeURIComponent(auditWindowStart)}&occurredBefore=${encodeURIComponent(auditWindowEnd)}`,
    );
    assert(
      dateRangeAudit.auditEvents.some((event) => event.id === latestAuditEvent.id) &&
        dateRangeAudit.auditEvents.every(
          (event) => event.occurredAt >= auditWindowStart && event.occurredAt < auditWindowEnd,
        ),
      "audit list can filter by occurred-at date range",
    );
    const futureAudit = await client.json(
      `/api/audit-events?occurredAfter=${encodeURIComponent("2999-01-01T00:00:00.000Z")}`,
    );
    assert(futureAudit.auditEvents.length === 0, "future audit date range returns no events");
    await expectApiError(
      await client.request("/api/audit-events?occurredAfter=not-a-date"),
      400,
      "invalid_audit_date_filter",
    );

    console.log("Worker integration passed.");
  } finally {
    await server.close();
  }
}

async function createTestEnv(overrides = {}) {
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
    ...overrides,
  };
}

async function testInboundEmailIntake(worker) {
  const env = await createTestEnv();
  const rawEmail = [
    'Content-Type: multipart/mixed; boundary="qitu-boundary"',
    "Subject: Inbound source",
    "From: sender@example.com",
    "To: intake@example.com",
    "",
    "--qitu-boundary",
    "Content-Type: text/plain",
    "",
    "Please process the attached source.",
    "--qitu-boundary",
    "Content-Type: text/csv",
    'Content-Disposition: attachment; filename="inbound-source.txt"',
    "Content-Transfer-Encoding: base64",
    "",
    "bGFiZWwsdmFsdWUKSW5ib3VuZCw0Mgo=",
    "--qitu-boundary--",
    "",
  ].join("\r\n");

  await worker.email(createInboundEmailMessage(rawEmail), env, {
    waitUntil() {},
    passThroughOnException() {},
  });

  assert(env.IMPORT_JOBS.messages.length === 1, "inbound email attachment queues import job");
  const inboundEmail = await env.DB.prepare(
    "SELECT id, raw_object_key, attachment_count, status FROM inbound_email_messages LIMIT 1",
  ).first();
  assert(inboundEmail?.attachment_count === 1, "inbound email stores receipt metadata");
  assert(inboundEmail.status === "queued", "inbound email receipt reflects queued attachment");
  assert(
    env.SOURCE_FILES.has(inboundEmail.raw_object_key),
    "inbound email stores raw RFC822 in R2",
  );

  const attachment = await env.DB.prepare(
    "SELECT source_file_id, import_job_id, object_key, status FROM inbound_email_attachments LIMIT 1",
  ).first();
  assert(attachment?.source_file_id, "inbound attachment links to source file");
  assert(attachment?.import_job_id, "inbound attachment links to import job");
  assert(attachment?.status === "queued", "inbound attachment stores queue status");

  const source = await env.DB.prepare(
    "SELECT filename, uploaded_by FROM source_files WHERE id = ? LIMIT 1",
  )
    .bind(attachment.source_file_id)
    .first();
  assert(source?.filename === "inbound-source.txt", "inbound attachment creates source file");
  assert(
    source?.uploaded_by === "system:inbound-email",
    "inbound source file records system actor",
  );
}

function createInboundEmailMessage(rawEmail) {
  const bytes = new TextEncoder().encode(rawEmail);
  return {
    from: "sender@example.com",
    headers: new Headers({
      "content-type": 'multipart/mixed; boundary="qitu-boundary"',
      from: "sender@example.com",
      subject: "Inbound source",
      to: "intake@example.com",
    }),
    raw: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    rawSize: bytes.byteLength,
    to: "intake@example.com",
    forward() {
      return Promise.resolve({ id: "forwarded" });
    },
    reply() {
      return Promise.resolve({ id: "reply" });
    },
    setReject(reason) {
      this.rejected = reason;
    },
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

async function expectApiError(response, status, code) {
  await expectStatus(response, status);
  const body = await response.json();
  assert(body?.error?.code === code, `expected API error code ${code}`);
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
  constructor(options = {}) {
    this.fail = options.fail === true;
    this.messages = [];
  }

  async send(message) {
    if (this.fail) {
      throw new Error("Simulated email failure");
    }

    this.messages.push(message);
    return {
      messageId: `email-${this.messages.length}`,
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

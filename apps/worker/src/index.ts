import {
  generateLocalImportReviewAdvisory,
  requiresHumanConfirmation,
  type AdvisoryArtifact,
} from "@qitu/ai-advisory";
import { createAuditEvent, type AuditEvent } from "@qitu/audit";
import {
  AcceptInvitationInputSchema,
  ConfirmPasswordResetInputSchema,
  CreateInvitationInputSchema,
  LoginInputSchema,
  RequestPasswordResetInputSchema,
  createInvitation,
  createPasswordResetToken,
  createSession,
  hashPassword,
  hashSecret,
  isExpired,
  normalizeEmail,
  verifyPassword,
  type User,
} from "@qitu/auth";
import { parseRuntimeConfig } from "@qitu/config";
import {
  renderInvitationEmail,
  renderPasswordResetEmail,
  type EmailDeliveryStatus,
  type EmailMessage,
} from "@qitu/email";
import { buildSourceFileKey, hashSourceContent } from "@qitu/files";
import type { CommitApprovedContext, ReviewIssue } from "@qitu/import-pipeline";
import { parseImportJobMessage, type ImportJobMessage } from "@qitu/jobs";
import { can, isRoleName, normalizeRole, type Permission } from "@qitu/rbac";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as v from "valibot";
import { parseStarterStagedRecord, starterImportReviewAdapter } from "./features/import-review";
import { parseStarterJsonStagedRecord, starterJsonRecordsAdapter } from "./features/json-records";

const app = new Hono<{ Bindings: Env }>();
const sessionCookieName = "qitu_session";
const registeredImportAdapters = [
  {
    id: starterImportReviewAdapter.id,
    jobKind: "starter.source-file",
    canHandle(source) {
      return starterImportReviewAdapter.canHandle(source);
    },
    async parseAndStage(source: ReadableStream<Uint8Array>) {
      const parsed = await starterImportReviewAdapter.parse(source);
      const staged = await starterImportReviewAdapter.stage(parsed);
      return staged.map((record) => ({
        payload: record,
        issues: starterImportReviewAdapter.validate(record),
      }));
    },
    async commitApproved(records: unknown[], context: CommitApprovedContext) {
      return starterImportReviewAdapter.commitApproved({
        records: records.map(parseStarterStagedRecord),
        context,
      });
    },
  },
  {
    id: starterJsonRecordsAdapter.id,
    jobKind: "starter.json-records",
    canHandle(source) {
      return starterJsonRecordsAdapter.canHandle(source);
    },
    async parseAndStage(source: ReadableStream<Uint8Array>) {
      const parsed = await starterJsonRecordsAdapter.parse(source);
      const staged = await starterJsonRecordsAdapter.stage(parsed);
      return staged.map((record) => ({
        payload: record,
        issues: starterJsonRecordsAdapter.validate(record),
      }));
    },
    async commitApproved(records: unknown[], context: CommitApprovedContext) {
      return starterJsonRecordsAdapter.commitApproved({
        records: records.map(parseStarterJsonStagedRecord),
        context,
      });
    },
  },
] satisfies WorkerImportAdapter[];

const ReviewDecisionInputSchema = v.object({
  note: v.optional(v.string()),
});

type AppContext = Context<{ Bindings: Env }>;

type WorkerImportAdapter = {
  id: string;
  jobKind: string;
  canHandle(source: { filename: string; contentType: string }): boolean;
  parseAndStage(source: ReadableStream<Uint8Array>): Promise<
    Array<{
      payload: unknown;
      issues: ReviewIssue[];
    }>
  >;
  commitApproved(records: unknown[], context: CommitApprovedContext): Promise<unknown[]>;
};

type UserRow = {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  created_at: string;
};

type InvitationRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  token_hash: string;
  expires_at: string;
  created_by: string;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

type LoginRow = UserRow & {
  password_hash: string;
};

type SessionUserRow = UserRow & {
  session_id: string;
  session_expires_at: string;
  session_absolute_expires_at: string;
};

type CurrentUser = {
  user: User;
  sessionId: string;
  expiresAt: string;
};

type PasswordResetTokenRow = {
  id: string;
  user_id: string;
  email: string;
  token_hash: string;
  status: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
  revoked_at: string | null;
};

type DuplicateSourceFileRow = {
  source_file_id: string;
  object_key: string;
  import_job_id: string | null;
  status: string | null;
};

type SourceFileRow = {
  id: string;
  workspace_id: string;
  object_key: string;
  filename: string;
  content_type: string;
  content_hash: string | null;
  size: number | null;
  uploaded_by: string;
  uploaded_at: string;
};

type ImportJobListRow = {
  id: string;
  source_file_id: string;
  status: string;
  job_kind: string | null;
  adapter_id: string | null;
  attempt_count: number | null;
  failure_reason: string | null;
  failure_class: string | null;
  processing_started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  filename: string;
  content_type: string;
  workspace_id: string;
};

type ImportJobReviewRow = {
  id: string;
  source_file_id: string;
  status: string;
  job_kind: string | null;
  adapter_id: string | null;
  failure_reason: string | null;
  failure_class: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  filename: string;
  content_type: string;
  object_key: string;
};

type PendingImportJobRow = {
  id: string;
  source_file_id: string;
  object_key: string;
  created_by: string;
};

type ExampleStagedRecordRow = {
  id: string;
  import_job_id: string;
  source_file_id: string;
  staged_record_key: string;
  source_row_key: string;
  payload_json: string;
  review_status: string;
  committed_record_id: string | null;
  created_at: string;
  updated_at: string;
};

type ExampleCommittedRecordRow = {
  id: string;
  import_job_id: string;
  source_file_id: string;
  staged_record_key: string;
  payload_json: string;
  committed_by: string;
  committed_at: string;
};

type ImportReviewIssueRow = {
  id: string;
  import_job_id: string;
  staged_record_key: string;
  code: string;
  message: string;
  severity: string;
  status: string;
  created_at: string;
};

type AiAdvisoryArtifactRow = {
  id: string;
  import_job_id: string;
  kind: string;
  status: string;
  provider: string;
  model: string;
  prompt_version: string;
  summary: string;
  output_json: string;
  created_by: string;
  created_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
};

type AuditEventRow = {
  id: string;
  action: string;
  actor_id: string;
  actor_kind: string;
  subject_id: string;
  subject_kind: string;
  metadata_json: string | null;
  occurred_at: string;
};

app.get("/health", (context) => {
  const runtime = parseRuntimeConfig({
    APP_ENV: context.env.APP_ENV,
  });

  return context.json({
    ok: true,
    service: "qitu-worker",
    environment: runtime.APP_ENV,
  });
});

app.post("/api/bootstrap/invitations", async (context) => {
  if (!isLocalRuntime(context)) {
    return authError(context, "bootstrap_disabled", "Bootstrap invitations are local-only.", 403);
  }

  const input = await parseRequestJson(context, CreateInvitationInputSchema);
  if (!input.ok) return input.response;

  return createInvitationResponse(context, input.value, {
    createdBy: "system",
    returnToken: true,
  });
});

app.post("/api/invitations", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "invitation:create");
  if (denied) return denied;

  const input = await parseRequestJson(context, CreateInvitationInputSchema);
  if (!input.ok) return input.response;

  return createInvitationResponse(context, input.value, {
    createdBy: current.user.id,
    returnToken: isLocalRuntime(context),
  });
});

async function createInvitationResponse(
  context: AppContext,
  input: { email: string; role?: string | undefined },
  options: { createdBy: string; returnToken: boolean },
): Promise<Response> {
  const requestedRole = input.role ?? "viewer";
  if (!isRoleName(requestedRole)) {
    return authError(context, "invalid_role", "Invitation role is not supported.", 400);
  }

  const invitationWithToken = await createInvitation({
    email: input.email,
    role: requestedRole,
    createdBy: options.createdBy,
  });

  const { invitation, token } = invitationWithToken;

  await context.env.DB.batch([
    context.env.DB.prepare(
      `
        INSERT INTO invitations (
          id, email, role, status, token_hash, expires_at, created_by, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(
      invitation.id,
      invitation.email,
      invitation.role,
      invitation.status,
      invitation.tokenHash,
      invitation.expiresAt,
      invitation.createdBy,
      invitation.createdAt,
    ),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "invitation.created",
        actor: {
          id: invitation.createdBy,
          kind: invitation.createdBy === "system" ? "system" : "user",
        },
        subject: {
          id: invitation.id,
          kind: "invitation",
        },
        metadata: {
          email: invitation.email,
          role: invitation.role,
        },
      }),
    ),
  ]);

  const inviteUrl = buildAppUrl(context.env, `/invite/${token}`);
  const email = renderInvitationEmail({
    appName: appName(context.env),
    email: invitation.email,
    url: inviteUrl,
  });
  const delivery = await deliverEmail(context.env, {
    kind: "invitation",
    to: invitation.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    metadata: {
      invitationId: invitation.id,
    },
  });

  return context.json(
    {
      invitation: publicInvitation(invitation),
      delivery: delivery.status,
      ...(options.returnToken
        ? {
            inviteToken: token,
            inviteUrl,
          }
        : {}),
    },
    201,
  );
}

app.post("/api/invitations/:token/accept", async (context) => {
  const token = context.req.param("token");
  const input = await parseRequestJson(context, AcceptInvitationInputSchema);
  if (!input.ok) return input.response;

  const tokenHash = await hashSecret(token);
  const invitation = await context.env.DB.prepare(
    `
      SELECT
        id, email, role, status, token_hash, expires_at, created_by, created_at, accepted_at, revoked_at
      FROM invitations
      WHERE token_hash = ?
      LIMIT 1
    `,
  )
    .bind(tokenHash)
    .first<InvitationRow>();

  if (!invitation) {
    return authError(context, "invalid_invitation", "Invitation is invalid or expired.", 404);
  }

  if (invitation.status !== "pending") {
    return authError(context, "invitation_not_pending", "Invitation is no longer pending.", 409);
  }

  if (isExpired(invitation.expires_at)) {
    await context.env.DB.prepare(
      "UPDATE invitations SET status = 'expired' WHERE id = ? AND status = 'pending'",
    )
      .bind(invitation.id)
      .run();

    return authError(context, "invitation_expired", "Invitation is invalid or expired.", 410);
  }

  const existingUser = await context.env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
    .bind(invitation.email)
    .first<{ id: string }>();

  if (existingUser) {
    return authError(context, "user_exists", "A user already exists for this invitation.", 409);
  }

  const now = new Date().toISOString();
  const user: User = {
    id: crypto.randomUUID(),
    email: normalizeEmail(invitation.email),
    role: normalizeRole(invitation.role),
    createdAt: now,
  };

  if (input.value.displayName) {
    user.displayName = input.value.displayName;
  }

  const passwordHash = await hashPassword(input.value.password);
  const { session, token: sessionToken } = await createSession({
    userId: user.id,
  });

  await context.env.DB.batch([
    context.env.DB.prepare(
      "INSERT INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(user.id, user.email, user.role, user.displayName ?? null, user.createdAt),
    context.env.DB.prepare(
      "INSERT INTO password_credentials (user_id, password_hash, updated_at) VALUES (?, ?, ?)",
    ).bind(user.id, passwordHash, now),
    context.env.DB.prepare(
      "UPDATE invitations SET status = 'accepted', accepted_at = ? WHERE id = ?",
    ).bind(now, invitation.id),
    prepareSessionInsert(context.env, session),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "invitation.accepted",
        actor: {
          id: user.id,
          kind: "user",
        },
        subject: {
          id: invitation.id,
          kind: "invitation",
        },
        metadata: {
          email: user.email,
          role: invitation.role,
        },
      }),
    ),
  ]);

  writeSessionCookie(context, sessionToken, session.expiresAt);

  return context.json(
    {
      user,
      session: publicSession(session),
    },
    201,
  );
});

app.post("/api/auth/login", async (context) => {
  const input = await parseRequestJson(context, LoginInputSchema);
  if (!input.ok) return input.response;

  const email = normalizeEmail(input.value.email);
  const row = await context.env.DB.prepare(
    `
      SELECT
        users.id,
        users.email,
        users.role,
        users.display_name,
        users.created_at,
        password_credentials.password_hash
      FROM users
      INNER JOIN password_credentials ON password_credentials.user_id = users.id
      WHERE users.email = ?
      LIMIT 1
    `,
  )
    .bind(email)
    .first<LoginRow>();

  const passwordMatches = row
    ? await verifyPassword(input.value.password, row.password_hash)
    : false;

  if (!row || !passwordMatches) {
    await writeAudit(
      context.env,
      createAuditEvent({
        action: "auth.login_failed",
        actor: {
          id: "anonymous",
          kind: "system",
        },
        subject: {
          id: email,
          kind: "email",
        },
      }),
    );

    return authError(context, "invalid_credentials", "Invalid email or password.", 401);
  }

  const user = mapUser(row);
  const { session, token } = await createSession({
    userId: user.id,
  });

  await context.env.DB.batch([
    prepareSessionInsert(context.env, session),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "auth.login_succeeded",
        actor: {
          id: user.id,
          kind: "user",
        },
        subject: {
          id: session.id,
          kind: "session",
        },
      }),
    ),
  ]);

  writeSessionCookie(context, token, session.expiresAt);

  return context.json({
    user,
    session: publicSession(session),
  });
});

app.post("/api/auth/password-reset/request", async (context) => {
  const input = await parseRequestJson(context, RequestPasswordResetInputSchema);
  if (!input.ok) return input.response;

  const email = normalizeEmail(input.value.email);
  const user = await context.env.DB.prepare(
    `
      SELECT id, email, role, display_name, created_at
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
  )
    .bind(email)
    .first<UserRow>();

  if (!user) {
    await writeAudit(
      context.env,
      createAuditEvent({
        action: "auth.password_reset_requested_unknown",
        actor: {
          id: "anonymous",
          kind: "system",
        },
        subject: {
          id: email,
          kind: "email",
        },
      }),
    );

    return context.json({
      ok: true,
    });
  }

  const { passwordResetToken, token } = await createPasswordResetToken({
    userId: user.id,
    email,
  });

  await context.env.DB.batch([
    context.env.DB.prepare(
      `
        INSERT INTO password_reset_tokens (
          id, user_id, email, token_hash, status, expires_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(
      passwordResetToken.id,
      passwordResetToken.userId,
      passwordResetToken.email,
      passwordResetToken.tokenHash,
      passwordResetToken.status,
      passwordResetToken.expiresAt,
      passwordResetToken.createdAt,
    ),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "auth.password_reset_requested",
        actor: {
          id: "anonymous",
          kind: "system",
        },
        subject: {
          id: user.id,
          kind: "user",
        },
      }),
    ),
  ]);

  const resetUrl = buildAppUrl(context.env, `/reset-password/${token}`);
  const emailMessage = renderPasswordResetEmail({
    appName: appName(context.env),
    email,
    url: resetUrl,
  });
  const delivery = await deliverEmail(context.env, {
    kind: "password_reset",
    to: email,
    subject: emailMessage.subject,
    html: emailMessage.html,
    text: emailMessage.text,
    metadata: {
      passwordResetTokenId: passwordResetToken.id,
      userId: user.id,
    },
  });

  return context.json({
    ok: true,
    delivery: delivery.status,
    ...(isLocalRuntime(context)
      ? {
          resetToken: token,
          resetUrl,
        }
      : {}),
  });
});

app.post("/api/auth/password-reset/confirm", async (context) => {
  const input = await parseRequestJson(context, ConfirmPasswordResetInputSchema);
  if (!input.ok) return input.response;

  const tokenHash = await hashSecret(input.value.token);
  const resetToken = await context.env.DB.prepare(
    `
      SELECT
        id, user_id, email, token_hash, status, expires_at, created_at, used_at, revoked_at
      FROM password_reset_tokens
      WHERE token_hash = ?
      LIMIT 1
    `,
  )
    .bind(tokenHash)
    .first<PasswordResetTokenRow>();

  if (!resetToken) {
    return authError(
      context,
      "invalid_password_reset_token",
      "Password reset link is invalid.",
      404,
    );
  }

  if (resetToken.status !== "pending") {
    return authError(
      context,
      "password_reset_token_not_pending",
      "Password reset link has already been used.",
      409,
    );
  }

  if (isExpired(resetToken.expires_at)) {
    await context.env.DB.prepare(
      "UPDATE password_reset_tokens SET status = 'expired' WHERE id = ? AND status = 'pending'",
    )
      .bind(resetToken.id)
      .run();

    return authError(
      context,
      "password_reset_token_expired",
      "Password reset link is expired.",
      410,
    );
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(input.value.password);

  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE password_credentials SET password_hash = ?, updated_at = ? WHERE user_id = ?",
    ).bind(passwordHash, now, resetToken.user_id),
    context.env.DB.prepare(
      "UPDATE password_reset_tokens SET status = 'used', used_at = ? WHERE id = ?",
    ).bind(now, resetToken.id),
    context.env.DB.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    ).bind(now, resetToken.user_id),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "auth.password_reset_succeeded",
        actor: {
          id: resetToken.user_id,
          kind: "user",
        },
        subject: {
          id: resetToken.id,
          kind: "password_reset_token",
        },
      }),
    ),
  ]);

  deleteCookie(context, sessionCookieName, {
    path: "/",
  });

  return context.json({
    ok: true,
  });
});

app.post("/api/auth/logout", async (context) => {
  const token = getCookie(context, sessionCookieName);
  if (token) {
    const tokenHash = await hashSecret(token);
    const now = new Date().toISOString();

    await context.env.DB.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    )
      .bind(now, tokenHash)
      .run();
  }

  deleteCookie(context, sessionCookieName, {
    path: "/",
  });

  return context.json({
    ok: true,
  });
});

app.get("/api/auth/me", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return context.json({
      user: null,
    });
  }

  return context.json({
    user: current.user,
    session: {
      id: current.sessionId,
      expiresAt: current.expiresAt,
    },
  });
});

app.get("/api/source-files", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const workspaceId = context.req.query("workspaceId") ?? "default";
  const limit = parseQueryLimit(context.req.query("limit"), 50);
  const result = await context.env.DB.prepare(
    `
      SELECT
        id,
        workspace_id,
        object_key,
        filename,
        content_type,
        content_hash,
        size,
        uploaded_by,
        uploaded_at
      FROM source_files
      WHERE workspace_id = ?
      ORDER BY uploaded_at DESC
      LIMIT ?
    `,
  )
    .bind(workspaceId, limit)
    .all<SourceFileRow>();

  return context.json({
    sourceFiles: result.results.map(publicSourceFile),
  });
});

app.get("/api/import-jobs", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const workspaceId = context.req.query("workspaceId") ?? "default";
  const status = context.req.query("status") ?? null;
  const limit = parseQueryLimit(context.req.query("limit"), 50);
  const result = await context.env.DB.prepare(
    `
      SELECT
        import_jobs.id,
        import_jobs.source_file_id,
        import_jobs.status,
        import_jobs.job_kind,
        import_jobs.adapter_id,
        import_jobs.attempt_count,
        import_jobs.failure_reason,
        import_jobs.failure_class,
        import_jobs.processing_started_at,
        import_jobs.completed_at,
        import_jobs.created_by,
        import_jobs.created_at,
        import_jobs.updated_at,
        source_files.filename,
        source_files.content_type,
        source_files.workspace_id
      FROM import_jobs
      INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
      WHERE source_files.workspace_id = ?
        AND (? IS NULL OR import_jobs.status = ?)
      ORDER BY import_jobs.created_at DESC
      LIMIT ?
    `,
  )
    .bind(workspaceId, status, status, limit)
    .all<ImportJobListRow>();

  return context.json({
    importJobs: result.results.map(publicImportJobListItem),
  });
});

app.get("/api/audit-events", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const subjectId = context.req.query("subjectId") ?? null;
  const subjectKind = context.req.query("subjectKind") ?? null;
  const actorId = context.req.query("actorId") ?? null;
  const limit = parseQueryLimit(context.req.query("limit"), 50);
  const result = await context.env.DB.prepare(
    `
      SELECT
        id,
        action,
        actor_id,
        actor_kind,
        subject_id,
        subject_kind,
        metadata_json,
        occurred_at
      FROM audit_events
      WHERE (? IS NULL OR subject_id = ?)
        AND (? IS NULL OR subject_kind = ?)
        AND (? IS NULL OR actor_id = ?)
      ORDER BY occurred_at DESC
      LIMIT ?
    `,
  )
    .bind(subjectId, subjectId, subjectKind, subjectKind, actorId, actorId, limit)
    .all<AuditEventRow>();

  return context.json({
    auditEvents: result.results.map(publicAuditEvent),
  });
});

app.post("/api/source-files", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "source_file:upload");
  if (denied) return denied;

  if (!context.req.raw.body) {
    return context.json(
      {
        error: {
          code: "missing_body",
          message: "Request body is required.",
        },
      },
      400,
    );
  }

  const content = await context.req.arrayBuffer();
  if (content.byteLength === 0) {
    return context.json(
      {
        error: {
          code: "empty_body",
          message: "Request body must not be empty.",
        },
      },
      400,
    );
  }

  const sourceFileId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const filename = context.req.header("x-filename") ?? "source.bin";
  const contentType = context.req.header("content-type") ?? "application/octet-stream";
  const adapter = selectImportAdapter({
    filename,
    contentType,
  });
  if (!adapter) {
    return context.json(
      {
        error: {
          code: "unsupported_source_file",
          message: "No import adapter can handle this source file.",
        },
      },
      415,
    );
  }

  const workspaceId = context.req.header("x-workspace-id") ?? "default";
  const size = content.byteLength;
  const contentHash = await hashSourceContent(content);
  const idempotencyKey = `${workspaceId}:${contentHash}`;
  const now = new Date().toISOString();
  const duplicate = await findDuplicateSourceFile(context.env, {
    workspaceId,
    contentHash,
  });

  if (duplicate) {
    return context.json({
      sourceFileId: duplicate.source_file_id,
      importJobId: duplicate.import_job_id,
      objectKey: duplicate.object_key,
      status: duplicate.status,
      duplicate: true,
    });
  }

  const objectKey = buildSourceFileKey({
    workspaceId,
    sourceFileId,
    filename,
  });

  await context.env.SOURCE_FILES.put(objectKey, content, {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      contentHash,
      uploadedBy: current.user.id,
    },
  });

  const message: ImportJobMessage = {
    kind: "import.source_file",
    jobId,
    sourceFileId,
    objectKey,
    requestedBy: current.user.id,
  };

  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `
          INSERT INTO source_files (
            id, workspace_id, object_key, filename, content_type, content_hash, size, uploaded_by, uploaded_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        sourceFileId,
        workspaceId,
        objectKey,
        filename,
        contentType,
        contentHash,
        size,
        current.user.id,
        now,
      ),
      context.env.DB.prepare(
        `
          INSERT INTO import_jobs (
            id,
            source_file_id,
            status,
            job_kind,
            adapter_id,
            idempotency_key,
            attempt_count,
            created_by,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        jobId,
        sourceFileId,
        "queued",
        adapter.jobKind,
        adapter.id,
        idempotencyKey,
        0,
        current.user.id,
        now,
        now,
      ),
      prepareAuditInsert(
        context.env,
        createAuditEvent({
          action: "source_file.uploaded",
          actor: {
            id: current.user.id,
            kind: "user",
          },
          subject: {
            id: sourceFileId,
            kind: "source_file",
          },
          metadata: {
            workspaceId,
            objectKey,
            filename,
            contentType,
            contentHash,
            importJobId: jobId,
          },
        }),
      ),
      prepareAuditInsert(
        context.env,
        createAuditEvent({
          action: "import_job.queued",
          actor: {
            id: current.user.id,
            kind: "user",
          },
          subject: {
            id: jobId,
            kind: "import_job",
          },
          metadata: {
            sourceFileId,
            objectKey,
            adapterId: adapter.id,
            jobKind: adapter.jobKind,
          },
        }),
      ),
    ]);
  } catch (error) {
    await context.env.SOURCE_FILES.delete(objectKey);
    throw error;
  }

  try {
    await context.env.IMPORT_JOBS.send(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Queue dispatch failed.";
    await markImportJobFailed(context.env, {
      jobId,
      reason,
      action: "import_job.dispatch_failed",
      failureClass: "queue_dispatch",
    });

    return context.json(
      {
        error: {
          code: "queue_dispatch_failed",
          message: "Source file was stored, but import job dispatch failed.",
        },
        sourceFileId,
        importJobId: jobId,
        objectKey,
        status: "failed",
      },
      503,
    );
  }

  return context.json(
    {
      sourceFileId,
      importJobId: jobId,
      objectKey,
      status: "queued",
    },
    202,
  );
});

app.post("/api/dev/import-jobs/drain", async (context) => {
  if (!isLocalRuntime(context)) {
    return authError(context, "dev_route_disabled", "This route is only available locally.", 403);
  }

  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "import_job:process");
  if (denied) return denied;

  const limit = parseQueryLimit(context.req.query("limit"), 10);
  const queuedJobs = await context.env.DB.prepare(
    `
      SELECT
        import_jobs.id,
        import_jobs.source_file_id,
        import_jobs.created_by,
        source_files.object_key
      FROM import_jobs
      INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
      WHERE import_jobs.status = 'queued'
      ORDER BY import_jobs.created_at ASC
      LIMIT ?
    `,
  )
    .bind(limit)
    .all<PendingImportJobRow>();

  const processedJobIds: string[] = [];
  for (const job of queuedJobs.results) {
    await processImportJob(context.env, {
      kind: "import.source_file",
      jobId: job.id,
      sourceFileId: job.source_file_id,
      objectKey: job.object_key,
      requestedBy: job.created_by,
    });
    processedJobIds.push(job.id);
  }

  return context.json({
    processedCount: processedJobIds.length,
    processedJobIds,
  });
});

app.post("/api/import-jobs/:jobId/retry", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "import_job:retry");
  if (denied) return denied;

  const jobId = context.req.param("jobId");
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  if (job.status !== "failed") {
    return authError(
      context,
      "import_job_not_failed",
      "Only failed import jobs can be retried.",
      409,
    );
  }

  const now = new Date().toISOString();
  const message: ImportJobMessage = {
    kind: "import.source_file",
    jobId,
    sourceFileId: job.source_file_id,
    objectKey: job.object_key,
    requestedBy: current.user.id,
  };

  await context.env.DB.batch([
    context.env.DB.prepare(
      `
        UPDATE import_jobs
        SET
          status = 'queued',
          failure_reason = NULL,
          failure_class = NULL,
          processing_started_at = NULL,
          completed_at = NULL,
          updated_at = ?
        WHERE id = ? AND status = 'failed'
      `,
    ).bind(now, jobId),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "import_job.retry_queued",
        actor: {
          id: current.user.id,
          kind: "user",
        },
        subject: {
          id: jobId,
          kind: "import_job",
        },
        metadata: {
          sourceFileId: job.source_file_id,
          objectKey: job.object_key,
          previousFailureClass: job.failure_class,
        },
      }),
    ),
  ]);

  try {
    await context.env.IMPORT_JOBS.send(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Queue dispatch failed.";
    await markImportJobFailed(context.env, {
      jobId,
      reason,
      action: "import_job.retry_dispatch_failed",
      failureClass: "queue_dispatch",
    });

    return context.json(
      {
        error: {
          code: "queue_dispatch_failed",
          message: "Import job retry was queued in D1, but queue dispatch failed.",
        },
      },
      503,
    );
  }

  return context.json({
    importJobId: jobId,
    status: "queued",
  });
});

app.get("/api/import-jobs/:jobId/review", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const jobId = context.req.param("jobId");
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  const [recordsResult, issuesResult] = await Promise.all([
    context.env.DB.prepare(
      `
        SELECT
          id,
          import_job_id,
          source_file_id,
          staged_record_key,
          source_row_key,
          payload_json,
          review_status,
          committed_record_id,
          created_at,
          updated_at
        FROM example_staged_records
        WHERE import_job_id = ?
        ORDER BY created_at ASC
      `,
    )
      .bind(jobId)
      .all<ExampleStagedRecordRow>(),
    context.env.DB.prepare(
      `
        SELECT
          id,
          import_job_id,
          staged_record_key,
          code,
          message,
          severity,
          status,
          created_at
        FROM import_review_issues
        WHERE import_job_id = ?
        ORDER BY created_at ASC
      `,
    )
      .bind(jobId)
      .all<ImportReviewIssueRow>(),
  ]);

  return context.json({
    job: publicImportJobReview(job),
    records: recordsResult.results.map(publicExampleStagedRecord),
    issues: issuesResult.results.map(publicImportReviewIssue),
  });
});

app.get("/api/import-jobs/:jobId/advisories", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const jobId = context.req.param("jobId");
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  const advisories = await readAiAdvisoryArtifacts(context.env, jobId);
  return context.json({
    advisories: advisories.map(publicAiAdvisoryArtifact),
  });
});

app.post("/api/import-jobs/:jobId/advisories", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "ai_advisory:write");
  if (denied) return denied;

  const jobId = context.req.param("jobId");
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  const stats = await readImportReviewStats(context.env, jobId);
  const artifact = await generateLocalImportReviewAdvisory({
    importJobId: jobId,
    createdBy: current.user.id,
    recordCount: stats.recordCount,
    issueCount: stats.issueCount,
    pendingCount: stats.pending,
    approvedCount: stats.approved,
    rejectedCount: stats.rejected,
    committedCount: stats.committed,
  });

  await context.env.DB.batch([
    prepareAiAdvisoryInsert(context.env, artifact),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "ai_advisory.generated",
        actor: {
          id: current.user.id,
          kind: "user",
        },
        subject: {
          id: artifact.id,
          kind: "ai_advisory_artifact",
        },
        metadata: {
          importJobId: job.id,
          provider: artifact.provider,
          model: artifact.model,
          promptVersion: artifact.promptVersion,
          humanConfirmationRequired: requiresHumanConfirmation(artifact),
        },
      }),
    ),
  ]);

  return context.json(
    {
      advisory: artifact,
    },
    201,
  );
});

app.post("/api/import-jobs/:jobId/advisories/:advisoryId/confirm", async (context) => {
  return updateAiAdvisoryStatusResponse(context, "confirmed");
});

app.post("/api/import-jobs/:jobId/advisories/:advisoryId/dismiss", async (context) => {
  return updateAiAdvisoryStatusResponse(context, "dismissed");
});

app.post("/api/import-jobs/:jobId/staged-records/:recordId/approve", async (context) => {
  return recordReviewDecisionResponse(context, "approve");
});

app.post("/api/import-jobs/:jobId/staged-records/:recordId/reject", async (context) => {
  return recordReviewDecisionResponse(context, "reject");
});

app.post("/api/import-jobs/:jobId/commit", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "import_job:commit");
  if (denied) return denied;

  const jobId = context.req.param("jobId");
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  const adapter = getImportAdapter(job.adapter_id);
  if (!adapter) {
    return authError(
      context,
      "import_adapter_not_found",
      "Import adapter is not registered for this job.",
      409,
    );
  }

  const recordsResult = await context.env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        source_file_id,
        staged_record_key,
        source_row_key,
        payload_json,
        review_status,
        committed_record_id,
        created_at,
        updated_at
      FROM example_staged_records
      WHERE import_job_id = ?
        AND review_status = 'approved'
        AND committed_record_id IS NULL
      ORDER BY created_at ASC
    `,
  )
    .bind(jobId)
    .all<ExampleStagedRecordRow>();

  const approvedRecords = recordsResult.results;
  if (approvedRecords.length === 0) {
    const committedResult = await context.env.DB.prepare(
      `
        SELECT
          id,
          import_job_id,
          source_file_id,
          staged_record_key,
          payload_json,
          committed_by,
          committed_at
        FROM example_committed_records
        WHERE import_job_id = ?
        ORDER BY committed_at ASC
      `,
    )
      .bind(jobId)
      .all<ExampleCommittedRecordRow>();

    if (committedResult.results.length > 0) {
      return context.json({
        importJobId: jobId,
        status: "committed",
        duplicate: true,
        committedRecords: committedResult.results.map(publicExampleCommittedRecord),
      });
    }

    return authError(
      context,
      "no_approved_records",
      "No approved staged records are available to commit.",
      409,
    );
  }

  const now = new Date().toISOString();
  const commitContext: CommitApprovedContext = {
    importJobId: jobId,
    reviewerId: current.user.id,
    approvedStagedRecordKeys: approvedRecords.map((record) => record.staged_record_key),
    idempotencyKey: `commit:${jobId}`,
  };
  const committedPayloads = await adapter.commitApproved(
    approvedRecords.map((record) => parseJsonValue(record.payload_json)),
    commitContext,
  );

  if (committedPayloads.length !== approvedRecords.length) {
    return authError(
      context,
      "commit_result_mismatch",
      "Import adapter returned a mismatched number of committed records.",
      409,
    );
  }

  const committedRecords = approvedRecords.map((record, index) => ({
    id: crypto.randomUUID(),
    record,
    payloadJson: JSON.stringify(committedPayloads[index]),
  }));

  await context.env.DB.batch([
    ...committedRecords.flatMap(({ id, record, payloadJson }) => [
      context.env.DB.prepare(
        `
          INSERT INTO example_committed_records (
            id,
            import_job_id,
            source_file_id,
            staged_record_key,
            payload_json,
            committed_by,
            committed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        id,
        record.import_job_id,
        record.source_file_id,
        record.staged_record_key,
        payloadJson,
        current.user.id,
        now,
      ),
      context.env.DB.prepare(
        `
          UPDATE example_staged_records
          SET review_status = 'committed', committed_record_id = ?, updated_at = ?
          WHERE id = ? AND review_status = 'approved' AND committed_record_id IS NULL
        `,
      ).bind(id, now, record.id),
      prepareAuditInsert(
        context.env,
        createAuditEvent({
          action: "import_review.record_committed",
          actor: {
            id: current.user.id,
            kind: "user",
          },
          subject: {
            id: record.id,
            kind: "example_staged_record",
          },
          metadata: {
            importJobId: jobId,
            stagedRecordKey: record.staged_record_key,
            committedRecordId: id,
            adapterId: adapter.id,
          },
        }),
      ),
    ]),
    context.env.DB.prepare(
      `
        UPDATE import_jobs
        SET status = 'committed', completed_at = ?, updated_at = ?
        WHERE id = ?
      `,
    ).bind(now, now, jobId),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "import_job.committed",
        actor: {
          id: current.user.id,
          kind: "user",
        },
        subject: {
          id: jobId,
          kind: "import_job",
        },
        metadata: {
          sourceFileId: job.source_file_id,
          committedCount: committedRecords.length,
          adapterId: adapter.id,
        },
      }),
    ),
  ]);

  return context.json({
    importJobId: jobId,
    status: "committed",
    committedRecords: committedRecords.map(({ id, record, payloadJson }) =>
      publicExampleCommittedRecord({
        id,
        import_job_id: record.import_job_id,
        source_file_id: record.source_file_id,
        staged_record_key: record.staged_record_key,
        payload_json: payloadJson,
        committed_by: current.user.id,
        committed_at: now,
      }),
    ),
  });
});

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = parseImportJobMessage(message.body);
      await processImportJob(env, body);
    }
  },
} satisfies ExportedHandler<Env, ImportJobMessage>;

async function processImportJob(env: Env, body: ImportJobMessage): Promise<void> {
  const now = new Date().toISOString();

  try {
    const job = await env.DB.prepare(
      `
        SELECT
          import_jobs.id,
          import_jobs.source_file_id,
          import_jobs.status,
          import_jobs.job_kind,
          import_jobs.adapter_id,
          import_jobs.failure_reason,
          import_jobs.failure_class,
          import_jobs.created_by,
          import_jobs.created_at,
          import_jobs.updated_at,
          import_jobs.completed_at,
          source_files.filename,
          source_files.content_type,
          source_files.object_key
        FROM import_jobs
        INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
        WHERE import_jobs.id = ?
        LIMIT 1
      `,
    )
      .bind(body.jobId)
      .first<ImportJobReviewRow>();

    if (!job || job.status !== "queued") {
      return;
    }

    const adapter = getImportAdapter(job.adapter_id);
    if (!adapter) {
      await markImportJobFailed(env, {
        jobId: body.jobId,
        reason: `Import adapter is not registered: ${job.adapter_id ?? "none"}.`,
        action: "import_job.adapter_missing",
        failureClass: "adapter_missing",
      });
      return;
    }

    const processingResult = await env.DB.prepare(
      `
        UPDATE import_jobs
        SET
          status = 'processing',
          processing_started_at = ?,
          completed_at = NULL,
          failure_reason = NULL,
          failure_class = NULL,
          updated_at = ?,
          attempt_count = COALESCE(attempt_count, 0) + 1
        WHERE id = ? AND status = 'queued'
      `,
    )
      .bind(now, now, body.jobId)
      .run();

    if ((processingResult.meta.changes ?? 0) === 0) {
      return;
    }

    await writeAudit(
      env,
      createAuditEvent({
        action: "import_job.processing_started",
        actor: {
          id: "queue",
          kind: "system",
        },
        subject: {
          id: body.jobId,
          kind: "import_job",
        },
        metadata: {
          sourceFileId: body.sourceFileId,
          objectKey: body.objectKey,
          adapterId: adapter.id,
        },
      }),
    );

    const sourceObject = await env.SOURCE_FILES.get(body.objectKey);
    if (!sourceObject) {
      await markImportJobFailed(env, {
        jobId: body.jobId,
        reason: "Source object was not found in R2.",
        action: "import_job.source_missing",
        failureClass: "source_missing",
      });
      return;
    }

    const stagedAt = new Date().toISOString();
    const stagedRecords = await adapter.parseAndStage(sourceObject.body);
    if (stagedRecords.length === 0) {
      await markImportJobFailed(env, {
        jobId: body.jobId,
        reason: "Import adapter did not produce any staged records.",
        action: "import_job.no_records",
        failureClass: "validation",
      });
      return;
    }

    const stagedRows = await Promise.all(
      stagedRecords.map(async (record, index) => {
        const stagedRecordKey = `source-file:${body.sourceFileId}:row:${index + 1}`;
        const existingStagedRecord = await env.DB.prepare(
          `
            SELECT id
            FROM example_staged_records
            WHERE import_job_id = ? AND staged_record_key = ?
            LIMIT 1
          `,
        )
          .bind(body.jobId, stagedRecordKey)
          .first<{ id: string }>();

        return {
          id: existingStagedRecord?.id ?? crypto.randomUUID(),
          stagedRecordKey,
          sourceRowKey: `row:${index + 1}`,
          payloadJson: JSON.stringify(record.payload),
          issues: [manualReviewIssue(), ...record.issues],
        };
      }),
    );

    await env.DB.batch([
      ...stagedRows.flatMap((row) => [
        env.DB.prepare(
          `
            INSERT OR IGNORE INTO example_staged_records (
              id,
              import_job_id,
              source_file_id,
              staged_record_key,
              source_row_key,
              payload_json,
              review_status,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          row.id,
          body.jobId,
          body.sourceFileId,
          row.stagedRecordKey,
          row.sourceRowKey,
          row.payloadJson,
          "pending",
          stagedAt,
          stagedAt,
        ),
        ...row.issues.map((issue) =>
          env.DB.prepare(
            `
              INSERT OR IGNORE INTO import_review_issues (
                id,
                import_job_id,
                staged_record_key,
                code,
                message,
                severity,
                status,
                created_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
          ).bind(
            crypto.randomUUID(),
            body.jobId,
            row.stagedRecordKey,
            issue.code,
            issue.message,
            issue.severity,
            "open",
            stagedAt,
          ),
        ),
        prepareAuditInsert(
          env,
          createAuditEvent({
            action: "import_review.record_staged",
            actor: {
              id: "queue",
              kind: "system",
            },
            subject: {
              id: row.id,
              kind: "example_staged_record",
            },
            metadata: {
              importJobId: body.jobId,
              sourceFileId: body.sourceFileId,
              stagedRecordKey: row.stagedRecordKey,
              adapterId: adapter.id,
            },
          }),
        ),
      ]),
      env.DB.prepare(
        `
          UPDATE import_jobs
          SET status = 'needs_review', completed_at = ?, updated_at = ?
          WHERE id = ?
        `,
      ).bind(stagedAt, stagedAt, body.jobId),
      prepareAuditInsert(
        env,
        createAuditEvent({
          action: "import_job.needs_review",
          actor: {
            id: "queue",
            kind: "system",
          },
          subject: {
            id: body.jobId,
            kind: "import_job",
          },
          metadata: {
            sourceFileId: body.sourceFileId,
            objectKey: body.objectKey,
            adapterId: adapter.id,
            stagedCount: stagedRows.length,
          },
        }),
      ),
    ]);
  } catch (error) {
    await markImportJobFailed(env, {
      jobId: body.jobId,
      reason: error instanceof Error ? error.message : "Import job processing failed.",
      action: "import_job.failed",
      failureClass: "processing",
    });
  }
}

async function parseRequestJson<TSchema extends v.GenericSchema>(
  context: AppContext,
  schema: TSchema,
): Promise<
  | {
      ok: true;
      value: v.InferOutput<TSchema>;
    }
  | {
      ok: false;
      response: Response;
    }
> {
  let body: unknown;

  try {
    body = await context.req.json();
  } catch {
    return {
      ok: false,
      response: context.json(
        {
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        400,
      ),
    };
  }

  const result = v.safeParse(schema, body);
  if (result.success) {
    return {
      ok: true,
      value: result.output,
    };
  }

  return {
    ok: false,
    response: context.json(
      {
        error: {
          code: "invalid_request",
          message: "Request body did not match the expected schema.",
          issues: result.issues.map((issue) => ({
            message: issue.message,
            path: issue.path?.map((item) => item.key).join("."),
          })),
        },
      },
      400,
    ),
  };
}

function authError(
  context: AppContext,
  code: string,
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 410,
): Response {
  return context.json(
    {
      error: {
        code,
        message,
      },
    },
    status,
  );
}

async function requirePermission(
  context: AppContext,
  current: CurrentUser,
  permission: Permission,
): Promise<Response | null> {
  const role = normalizeRole(current.user.role);
  if (
    can(
      {
        id: current.user.id,
        role,
      },
      permission,
    )
  ) {
    return null;
  }

  await writeAudit(
    context.env,
    createAuditEvent({
      action: "rbac.denied",
      actor: {
        id: current.user.id,
        kind: "user",
      },
      subject: {
        id: permission,
        kind: "permission",
      },
      metadata: {
        method: context.req.method,
        path: context.req.path,
        role,
      },
    }),
  );

  return authError(context, "forbidden", "This user does not have permission.", 403);
}

function publicInvitation(invitation: {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}): Record<string, string> {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

function publicSession(session: { id: string; expiresAt: string }): Record<string, string> {
  return {
    id: session.id,
    expiresAt: session.expiresAt,
  };
}

function mapUser(row: UserRow): User {
  const user: User = {
    id: row.id,
    email: row.email,
    role: normalizeRole(row.role),
    createdAt: row.created_at,
  };

  if (row.display_name) {
    user.displayName = row.display_name;
  }

  return user;
}

function prepareSessionInsert(
  env: Env,
  session: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
    absoluteExpiresAt: string;
    createdAt: string;
    lastSeenAt: string;
  },
): D1PreparedStatement {
  return env.DB.prepare(
    `
      INSERT INTO sessions (
        id, user_id, token_hash, expires_at, absolute_expires_at, created_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).bind(
    session.id,
    session.userId,
    session.tokenHash,
    session.expiresAt,
    session.absoluteExpiresAt,
    session.createdAt,
    session.lastSeenAt,
  );
}

function prepareAuditInsert(env: Env, event: AuditEvent): D1PreparedStatement {
  return env.DB.prepare(
    `
      INSERT INTO audit_events (
        id, action, actor_id, actor_kind, subject_id, subject_kind, metadata_json, occurred_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).bind(
    event.id,
    event.action,
    event.actor.id,
    event.actor.kind,
    event.subject.id,
    event.subject.kind,
    JSON.stringify(event.metadata ?? {}),
    event.occurredAt,
  );
}

async function writeAudit(env: Env, event: AuditEvent): Promise<void> {
  await prepareAuditInsert(env, event).run();
}

function selectImportAdapter(source: {
  filename: string;
  contentType: string;
}): WorkerImportAdapter | null {
  return registeredImportAdapters.find((adapter) => adapter.canHandle(source)) ?? null;
}

function getImportAdapter(adapterId: string | null): WorkerImportAdapter | null {
  if (!adapterId) {
    return null;
  }

  return registeredImportAdapters.find((adapter) => adapter.id === adapterId) ?? null;
}

async function readImportReviewStats(
  env: Env,
  jobId: string,
): Promise<{
  recordCount: number;
  issueCount: number;
  pending: number;
  approved: number;
  rejected: number;
  committed: number;
}> {
  const [recordsResult, issuesCount] = await Promise.all([
    env.DB.prepare(
      `
        SELECT review_status
        FROM example_staged_records
        WHERE import_job_id = ?
      `,
    )
      .bind(jobId)
      .all<{ review_status: string }>(),
    env.DB.prepare(
      `
        SELECT COUNT(*) AS issue_count
        FROM import_review_issues
        WHERE import_job_id = ?
          AND status = 'open'
      `,
    )
      .bind(jobId)
      .first<{ issue_count: number }>(),
  ]);

  const counts = recordsResult.results.reduce(
    (accumulator, record) => {
      if (record.review_status === "pending") accumulator.pending += 1;
      if (record.review_status === "approved") accumulator.approved += 1;
      if (record.review_status === "rejected") accumulator.rejected += 1;
      if (record.review_status === "committed") accumulator.committed += 1;
      return accumulator;
    },
    {
      pending: 0,
      approved: 0,
      rejected: 0,
      committed: 0,
    },
  );

  return {
    recordCount: recordsResult.results.length,
    issueCount: Number(issuesCount?.issue_count ?? 0),
    ...counts,
  };
}

async function readAiAdvisoryArtifacts(env: Env, jobId: string): Promise<AiAdvisoryArtifactRow[]> {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        kind,
        status,
        provider,
        model,
        prompt_version,
        summary,
        output_json,
        created_by,
        created_at,
        confirmed_by,
        confirmed_at,
        dismissed_by,
        dismissed_at
      FROM ai_advisory_artifacts
      WHERE import_job_id = ?
      ORDER BY created_at DESC
    `,
  )
    .bind(jobId)
    .all<AiAdvisoryArtifactRow>();

  return result.results;
}

function prepareAiAdvisoryInsert(env: Env, artifact: AdvisoryArtifact): D1PreparedStatement {
  return env.DB.prepare(
    `
      INSERT INTO ai_advisory_artifacts (
        id,
        import_job_id,
        kind,
        status,
        provider,
        model,
        prompt_version,
        summary,
        output_json,
        created_by,
        created_at,
        confirmed_by,
        confirmed_at,
        dismissed_by,
        dismissed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).bind(
    artifact.id,
    artifact.importJobId,
    artifact.kind,
    artifact.status,
    artifact.provider,
    artifact.model,
    artifact.promptVersion,
    artifact.summary,
    JSON.stringify(artifact.output),
    artifact.createdBy,
    artifact.createdAt,
    artifact.confirmedBy ?? null,
    artifact.confirmedAt ?? null,
    artifact.dismissedBy ?? null,
    artifact.dismissedAt ?? null,
  );
}

async function updateAiAdvisoryStatusResponse(
  context: AppContext,
  targetStatus: "confirmed" | "dismissed",
): Promise<Response> {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "ai_advisory:write");
  if (denied) return denied;

  const jobId = context.req.param("jobId");
  const advisoryId = context.req.param("advisoryId");
  if (!advisoryId) {
    return authError(context, "ai_advisory_not_found", "AI advisory was not found.", 404);
  }

  const advisory = await context.env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        kind,
        status,
        provider,
        model,
        prompt_version,
        summary,
        output_json,
        created_by,
        created_at,
        confirmed_by,
        confirmed_at,
        dismissed_by,
        dismissed_at
      FROM ai_advisory_artifacts
      WHERE id = ? AND import_job_id = ?
      LIMIT 1
    `,
  )
    .bind(advisoryId, jobId)
    .first<AiAdvisoryArtifactRow>();

  if (!advisory) {
    return authError(context, "ai_advisory_not_found", "AI advisory was not found.", 404);
  }

  if (advisory.status === targetStatus) {
    return context.json({
      advisory: publicAiAdvisoryArtifact(advisory),
      duplicate: true,
    });
  }

  if (advisory.status !== "suggested") {
    return authError(
      context,
      "ai_advisory_not_suggested",
      "Only suggested AI advisories can be updated.",
      409,
    );
  }

  const now = new Date().toISOString();
  const columnPrefix = targetStatus === "confirmed" ? "confirmed" : "dismissed";
  await context.env.DB.batch([
    context.env.DB.prepare(
      `
        UPDATE ai_advisory_artifacts
        SET status = ?, ${columnPrefix}_by = ?, ${columnPrefix}_at = ?
        WHERE id = ? AND import_job_id = ? AND status = 'suggested'
      `,
    ).bind(targetStatus, current.user.id, now, advisoryId, jobId),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: `ai_advisory.${targetStatus}`,
        actor: {
          id: current.user.id,
          kind: "user",
        },
        subject: {
          id: advisoryId,
          kind: "ai_advisory_artifact",
        },
        metadata: {
          importJobId: jobId,
        },
      }),
    ),
  ]);

  return context.json({
    advisory: publicAiAdvisoryArtifact({
      ...advisory,
      status: targetStatus,
      ...(targetStatus === "confirmed"
        ? {
            confirmed_by: current.user.id,
            confirmed_at: now,
          }
        : {
            dismissed_by: current.user.id,
            dismissed_at: now,
          }),
    }),
  });
}

function manualReviewIssue(): ReviewIssue {
  return {
    code: "manual_review_required",
    message: "Record was staged and requires human review before commit.",
    severity: "info",
  };
}

async function deliverEmail(
  env: Env,
  input: {
    kind: "invitation" | "password_reset";
    to: string;
    subject: string;
    html: string;
    text: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{
  id: string;
  status: EmailDeliveryStatus;
  provider: string;
  providerMessageId?: string;
}> {
  const config = runtimeConfig(env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const provider = config.APP_ENV === "local" ? "local" : "cloudflare_email";
  const message: EmailMessage = {
    to: input.to,
    from: {
      email: config.MAIL_FROM ?? "noreply@example.com",
      name: appName(env),
    },
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  let status: EmailDeliveryStatus = "stored";
  let providerMessageId: string | undefined;
  let errorMessage: string | null = null;
  let sentAt: string | null = null;

  if (config.APP_ENV !== "local") {
    try {
      const result: unknown = await env.EMAIL.send({
        to: message.to,
        from: message.from.email,
        subject: message.subject,
        ...(message.text ? { text: message.text } : {}),
        ...(message.html ? { html: message.html } : {}),
      });
      status = "sent";
      providerMessageId = providerMessageIdFrom(result);
      sentAt = new Date().toISOString();
    } catch (error) {
      status = "failed";
      errorMessage = error instanceof Error ? error.message : "Email delivery failed.";
    }
  }

  await env.DB.prepare(
    `
      INSERT INTO email_messages (
        id,
        kind,
        recipient_email,
        subject,
        status,
        provider,
        provider_message_id,
        error_message,
        metadata_json,
        created_at,
        sent_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      id,
      input.kind,
      input.to,
      input.subject,
      status,
      provider,
      providerMessageId ?? null,
      errorMessage,
      JSON.stringify(input.metadata ?? {}),
      now,
      sentAt,
    )
    .run();

  return {
    id,
    status,
    provider,
    ...(providerMessageId ? { providerMessageId } : {}),
  };
}

function runtimeConfig(env: Env) {
  return parseRuntimeConfig({
    APP_ENV: env.APP_ENV,
    MAIL_FROM: env.MAIL_FROM || undefined,
    PUBLIC_APP_NAME: env.PUBLIC_APP_NAME || undefined,
    PUBLIC_APP_URL: env.PUBLIC_APP_URL || undefined,
  });
}

function appName(env: Env): string {
  return runtimeConfig(env).PUBLIC_APP_NAME ?? "qitu";
}

function buildAppUrl(env: Env, path: string): string {
  const baseUrl = runtimeConfig(env).PUBLIC_APP_URL ?? "http://localhost:5173";
  return new URL(path, baseUrl).toString();
}

function providerMessageIdFrom(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const candidate = "id" in result ? result.id : undefined;
  return typeof candidate === "string" ? candidate : undefined;
}

async function findDuplicateSourceFile(
  env: Env,
  input: { workspaceId: string; contentHash: string },
): Promise<DuplicateSourceFileRow | null> {
  return env.DB.prepare(
    `
      SELECT
        source_files.id AS source_file_id,
        source_files.object_key,
        import_jobs.id AS import_job_id,
        import_jobs.status
      FROM source_files
      LEFT JOIN import_jobs ON import_jobs.source_file_id = source_files.id
      WHERE source_files.workspace_id = ?
        AND source_files.content_hash = ?
      ORDER BY import_jobs.created_at DESC
      LIMIT 1
    `,
  )
    .bind(input.workspaceId, input.contentHash)
    .first<DuplicateSourceFileRow>();
}

async function recordReviewDecisionResponse(
  context: AppContext,
  action: "approve" | "reject",
): Promise<Response> {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "review:decide");
  if (denied) return denied;

  const input = await parseRequestJson(context, ReviewDecisionInputSchema);
  if (!input.ok) return input.response;

  const jobId = context.req.param("jobId");
  const recordId = context.req.param("recordId");
  const record = await context.env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        source_file_id,
        staged_record_key,
        source_row_key,
        payload_json,
        review_status,
        committed_record_id,
        created_at,
        updated_at
      FROM example_staged_records
      WHERE id = ? AND import_job_id = ?
      LIMIT 1
    `,
  )
    .bind(recordId, jobId)
    .first<ExampleStagedRecordRow>();

  if (!record) {
    return authError(context, "staged_record_not_found", "Staged record was not found.", 404);
  }

  if (record.review_status === "committed") {
    return authError(
      context,
      "staged_record_committed",
      "Committed records cannot be reviewed again.",
      409,
    );
  }

  const targetStatus = action === "approve" ? "approved" : "rejected";
  if (record.review_status === targetStatus) {
    return context.json({
      record: publicExampleStagedRecord(record),
      duplicate: true,
    });
  }

  const now = new Date().toISOString();
  const decisionId = crypto.randomUUID();
  const recordDecisionId = crypto.randomUUID();
  const note = input.value.note ?? null;
  const jobStatus = action === "approve" ? "approved" : "needs_review";

  await context.env.DB.batch([
    context.env.DB.prepare(
      `
        INSERT INTO import_review_decisions (
          id, import_job_id, action, reviewer_user_id, note, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).bind(decisionId, jobId, action, current.user.id, note, now),
    context.env.DB.prepare(
      `
        INSERT INTO import_review_record_decisions (
          id, decision_id, import_job_id, staged_record_key, action, note, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(recordDecisionId, decisionId, jobId, record.staged_record_key, action, note, now),
    context.env.DB.prepare(
      `
        UPDATE example_staged_records
        SET review_status = ?, updated_at = ?
        WHERE id = ?
      `,
    ).bind(targetStatus, now, record.id),
    context.env.DB.prepare(
      `
        UPDATE import_jobs
        SET status = ?, updated_at = ?
        WHERE id = ?
      `,
    ).bind(jobStatus, now, jobId),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: `import_review.record_${targetStatus}`,
        actor: {
          id: current.user.id,
          kind: "user",
        },
        subject: {
          id: record.id,
          kind: "example_staged_record",
        },
        metadata: {
          importJobId: jobId,
          stagedRecordKey: record.staged_record_key,
          decisionId,
        },
      }),
    ),
  ]);

  return context.json({
    record: publicExampleStagedRecord({
      ...record,
      review_status: targetStatus,
      updated_at: now,
    }),
  });
}

async function readImportJobReview(env: Env, jobId: string): Promise<ImportJobReviewRow | null> {
  return env.DB.prepare(
    `
      SELECT
        import_jobs.id,
        import_jobs.source_file_id,
        import_jobs.status,
        import_jobs.job_kind,
        import_jobs.adapter_id,
        import_jobs.failure_reason,
        import_jobs.failure_class,
        import_jobs.created_by,
        import_jobs.created_at,
        import_jobs.updated_at,
        import_jobs.completed_at,
        source_files.filename,
        source_files.content_type,
        source_files.object_key
      FROM import_jobs
      INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
      WHERE import_jobs.id = ?
      LIMIT 1
    `,
  )
    .bind(jobId)
    .first<ImportJobReviewRow>();
}

function publicImportJobReview(row: ImportJobReviewRow): Record<string, unknown> {
  return {
    id: row.id,
    sourceFileId: row.source_file_id,
    status: row.status,
    jobKind: row.job_kind,
    adapterId: row.adapter_id,
    failureReason: row.failure_reason,
    failureClass: row.failure_class,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    sourceFile: {
      filename: row.filename,
      contentType: row.content_type,
      objectKey: row.object_key,
    },
  };
}

function publicSourceFile(row: SourceFileRow): Record<string, unknown> {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    objectKey: row.object_key,
    filename: row.filename,
    contentType: row.content_type,
    contentHash: row.content_hash,
    size: row.size,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

function publicImportJobListItem(row: ImportJobListRow): Record<string, unknown> {
  return {
    id: row.id,
    sourceFileId: row.source_file_id,
    status: row.status,
    jobKind: row.job_kind,
    adapterId: row.adapter_id,
    attemptCount: row.attempt_count ?? 0,
    failureReason: row.failure_reason,
    failureClass: row.failure_class,
    processingStartedAt: row.processing_started_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceFile: {
      filename: row.filename,
      contentType: row.content_type,
      workspaceId: row.workspace_id,
    },
  };
}

function publicExampleStagedRecord(row: ExampleStagedRecordRow): Record<string, unknown> {
  return {
    id: row.id,
    importJobId: row.import_job_id,
    sourceFileId: row.source_file_id,
    stagedRecordKey: row.staged_record_key,
    sourceRowKey: row.source_row_key,
    payload: parseJsonValue(row.payload_json),
    reviewStatus: row.review_status,
    committedRecordId: row.committed_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicExampleCommittedRecord(row: ExampleCommittedRecordRow): Record<string, unknown> {
  return {
    id: row.id,
    importJobId: row.import_job_id,
    sourceFileId: row.source_file_id,
    stagedRecordKey: row.staged_record_key,
    payload: parseJsonValue(row.payload_json),
    committedBy: row.committed_by,
    committedAt: row.committed_at,
  };
}

function publicImportReviewIssue(row: ImportReviewIssueRow): Record<string, string> {
  return {
    id: row.id,
    importJobId: row.import_job_id,
    stagedRecordKey: row.staged_record_key,
    code: row.code,
    message: row.message,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at,
  };
}

function publicAiAdvisoryArtifact(row: AiAdvisoryArtifactRow): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    importJobId: row.import_job_id,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    summary: row.summary,
    output: parseJsonValue(row.output_json),
    createdAt: row.created_at,
    createdBy: row.created_by,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    dismissedBy: row.dismissed_by,
    dismissedAt: row.dismissed_at,
  };
}

function publicAuditEvent(row: AuditEventRow): Record<string, unknown> {
  return {
    id: row.id,
    action: row.action,
    actor: {
      id: row.actor_id,
      kind: row.actor_kind,
    },
    subject: {
      id: row.subject_id,
      kind: row.subject_kind,
    },
    metadata: row.metadata_json ? parseJsonValue(row.metadata_json) : {},
    occurredAt: row.occurred_at,
  };
}

function parseJsonValue(value: string): unknown {
  return JSON.parse(value);
}

function parseQueryLimit(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

async function markImportJobFailed(
  env: Env,
  input: { jobId: string; reason: string; action: string; failureClass?: string },
): Promise<void> {
  const now = new Date().toISOString();
  const failureClass = input.failureClass ?? "infrastructure";
  await env.DB.batch([
    env.DB.prepare(
      `
        UPDATE import_jobs
        SET
          status = 'failed',
          failure_reason = ?,
          failure_class = ?,
          completed_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
    ).bind(input.reason, failureClass, now, now, input.jobId),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: input.action,
        actor: {
          id: "queue",
          kind: "system",
        },
        subject: {
          id: input.jobId,
          kind: "import_job",
        },
        metadata: {
          reason: input.reason,
          failureClass,
        },
      }),
    ),
  ]);
}

function isLocalRuntime(context: AppContext): boolean {
  const runtime = parseRuntimeConfig({
    APP_ENV: context.env.APP_ENV,
  });

  return runtime.APP_ENV === "local";
}

function writeSessionCookie(context: AppContext, token: string, expiresAt: string): void {
  const runtime = parseRuntimeConfig({
    APP_ENV: context.env.APP_ENV,
  });

  setCookie(context, sessionCookieName, token, {
    httpOnly: true,
    secure: runtime.APP_ENV !== "local",
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

async function readCurrentUser(context: AppContext): Promise<{
  user: User;
  sessionId: string;
  expiresAt: string;
} | null> {
  const token = getCookie(context, sessionCookieName);
  if (!token) return null;

  const tokenHash = await hashSecret(token);
  const row = await context.env.DB.prepare(
    `
      SELECT
        users.id,
        users.email,
        users.role,
        users.display_name,
        users.created_at,
        sessions.id AS session_id,
        sessions.expires_at AS session_expires_at,
        sessions.absolute_expires_at AS session_absolute_expires_at
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
        AND sessions.revoked_at IS NULL
      LIMIT 1
    `,
  )
    .bind(tokenHash)
    .first<SessionUserRow>();

  if (!row) return null;

  if (isExpired(row.session_expires_at) || isExpired(row.session_absolute_expires_at)) {
    await context.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), row.session_id)
      .run();
    return null;
  }

  await context.env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), row.session_id)
    .run();

  return {
    user: mapUser(row),
    sessionId: row.session_id,
    expiresAt: row.session_expires_at,
  };
}

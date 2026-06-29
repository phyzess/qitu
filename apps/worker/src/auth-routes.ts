import { createAuditEvent } from "@qitu/audit";
import {
  AcceptInvitationInputSchema,
  ConfirmPasswordResetInputSchema,
  CreateInvitationInputSchema,
  EmailSchema,
  LoginInputSchema,
  PasswordSchema,
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
import { renderInvitationEmail, renderPasswordResetEmail } from "@qitu/email";
import { can, isRoleName, normalizeRole, type Permission } from "@qitu/rbac";
import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as v from "valibot";
import { prepareAuditInsert, writeAudit } from "./audit-store";
import { deliverEmail } from "./email-delivery";
import {
  hashEventValue,
  prepareLoginAttemptInsert,
  prepareSecurityEventInsert,
  requestFingerprint,
} from "./event-store";
import { authError, parseQueryLimit, parseRequestJson, type AppContext } from "./http-utils";
import { localeFromRequest, type WorkerLocale } from "./locale";
import { appName, buildAppUrl, isLocalAppEnv, runtimeConfig } from "./runtime";

const sessionCookieName = "qitu_session";
const LocalUserBootstrapInputSchema = v.object({
  email: EmailSchema,
  displayName: v.optional(v.string()),
  password: PasswordSchema,
});

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

export type CurrentUser = {
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

export function registerAuthRoutes(app: Hono<{ Bindings: Env }>): void {
  app.post("/api/bootstrap/invitations", async (context) => {
    if (!isLocalRuntime(context)) {
      return authError(context, "bootstrap_disabled", "Bootstrap invitations are local-only.", 403);
    }

    const input = await parseRequestJson(context, CreateInvitationInputSchema);
    if (!input.ok) return input.response;
    const locale = localeFromRequest(context, input.body);

    return createInvitationResponse(context, input.value, {
      createdBy: "system",
      locale,
      returnToken: true,
    });
  });

  app.post("/api/bootstrap/local-reviewer", async (context) => {
    return createLocalUserBootstrapResponse(context, {
      action: "auth.local_reviewer_bootstrap",
      defaultDisplayName: "Reviewer",
      eventType: "auth.local_reviewer_bootstrapped",
      role: "reviewer",
    });
  });

  app.post("/api/bootstrap/local-admin", async (context) => {
    return createLocalUserBootstrapResponse(context, {
      action: "auth.local_admin_bootstrap",
      defaultDisplayName: "Admin",
      eventType: "auth.local_admin_bootstrapped",
      role: "admin",
    });
  });

  app.get("/api/users", async (context) => {
    const current = await readCurrentUser(context);
    if (!current) {
      return authError(context, "unauthorized", "Login is required.", 401);
    }
    const denied = await requirePermission(context, current, "invitation:create");
    if (denied) return denied;

    const limit = parseQueryLimit(context.req.query("limit"), 50);
    const result = await context.env.DB.prepare(
      `
        SELECT id, email, role, display_name, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
      .bind(limit)
      .all<UserRow>();

    return context.json({
      users: result.results.map(mapUser),
    });
  });

  app.get("/api/invitations", async (context) => {
    const current = await readCurrentUser(context);
    if (!current) {
      return authError(context, "unauthorized", "Login is required.", 401);
    }
    const denied = await requirePermission(context, current, "invitation:create");
    if (denied) return denied;

    const limit = parseQueryLimit(context.req.query("limit"), 50);
    const result = await context.env.DB.prepare(
      `
        SELECT
          id, email, role, status, token_hash, expires_at, created_by, created_at, accepted_at, revoked_at
        FROM invitations
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
      .bind(limit)
      .all<InvitationRow>();

    return context.json({
      invitations: result.results.map(publicInvitationListItem),
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
    const locale = localeFromRequest(context, input.body);

    return createInvitationResponse(context, input.value, {
      createdBy: current.user.id,
      locale,
      returnToken: isLocalRuntime(context),
    });
  });

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

    const existingUser = await context.env.DB.prepare(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
    )
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
    const fingerprint = await requestFingerprint(context);
    const emailHash = (await hashEventValue(email)) ?? email;

    if (!row || !passwordMatches) {
      const now = new Date().toISOString();
      await context.env.DB.batch([
        prepareLoginAttemptInsert(context.env, {
          ...fingerprint,
          emailHash,
          userId: row?.id ?? null,
          outcome: "failed",
          failureReason: "invalid_credentials",
          createdAt: now,
        }),
        prepareSecurityEventInsert(context.env, {
          ...fingerprint,
          eventType: "auth.login_failed",
          severity: "warning",
          actorUserId: row?.id ?? null,
          targetUserId: row?.id ?? null,
          action: "auth.login",
          outcome: "failed",
          createdAt: now,
          metadata: {
            reason: "invalid_credentials",
          },
        }),
        prepareAuditInsert(
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
        ),
      ]);

      return authError(context, "invalid_credentials", "Invalid email or password.", 401);
    }

    const user = mapUser(row);
    const { session, token } = await createSession({
      userId: user.id,
    });

    await context.env.DB.batch([
      prepareSessionInsert(context.env, session),
      prepareLoginAttemptInsert(context.env, {
        ...fingerprint,
        emailHash,
        userId: user.id,
        outcome: "succeeded",
        createdAt: session.createdAt,
      }),
      prepareSecurityEventInsert(context.env, {
        ...fingerprint,
        eventType: "auth.login_succeeded",
        severity: "info",
        actorUserId: user.id,
        targetUserId: user.id,
        action: "auth.login",
        outcome: "succeeded",
        sessionId: session.id,
        createdAt: session.createdAt,
      }),
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
    const locale = localeFromRequest(context, input.body);

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
      locale,
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
}

async function createLocalUserBootstrapResponse(
  context: AppContext,
  options: {
    action: string;
    defaultDisplayName: string;
    eventType: string;
    role: "admin" | "reviewer";
  },
): Promise<Response> {
  if (!isLocalRuntime(context)) {
    return authError(context, "bootstrap_disabled", "Local user bootstrap is local-only.", 403);
  }

  const input = await parseRequestJson(context, LocalUserBootstrapInputSchema);
  if (!input.ok) return input.response;

  const email = normalizeEmail(input.value.email);
  const now = new Date().toISOString();
  const displayName = input.value.displayName || options.defaultDisplayName;
  const fingerprint = await requestFingerprint(context);
  const emailHash = (await hashEventValue(email)) ?? email;
  const existingUser = await context.env.DB.prepare(
    `
      SELECT id, email, role, display_name, created_at
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
  )
    .bind(email)
    .first<UserRow>();
  const passwordHash = await hashPassword(input.value.password);
  const user: User = existingUser
    ? {
        id: existingUser.id,
        email: existingUser.email,
        role: options.role,
        displayName,
        createdAt: existingUser.created_at,
      }
    : {
        id: crypto.randomUUID(),
        email,
        role: options.role,
        displayName,
        createdAt: now,
      };
  const { session, token } = await createSession({
    userId: user.id,
  });

  await context.env.DB.batch([
    existingUser
      ? context.env.DB.prepare("UPDATE users SET role = ?, display_name = ? WHERE id = ?").bind(
          user.role,
          user.displayName ?? null,
          user.id,
        )
      : context.env.DB.prepare(
          "INSERT INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
        ).bind(user.id, user.email, user.role, user.displayName ?? null, user.createdAt),
    context.env.DB.prepare(
      `
        INSERT INTO password_credentials (user_id, password_hash, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          password_hash = excluded.password_hash,
          updated_at = excluded.updated_at
      `,
    ).bind(user.id, passwordHash, now),
    context.env.DB.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    ).bind(now, user.id),
    prepareSessionInsert(context.env, session),
    prepareLoginAttemptInsert(context.env, {
      ...fingerprint,
      emailHash,
      userId: user.id,
      outcome: "succeeded",
      createdAt: now,
    }),
    prepareSecurityEventInsert(context.env, {
      ...fingerprint,
      eventType: options.eventType,
      severity: "info",
      actorUserId: user.id,
      targetUserId: user.id,
      action: options.action,
      outcome: "succeeded",
      sessionId: session.id,
      createdAt: now,
      metadata: {
        created: !existingUser,
        role: user.role,
      },
    }),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: options.eventType,
        actor: {
          id: "system",
          kind: "system",
        },
        subject: {
          id: user.id,
          kind: "user",
        },
        metadata: {
          created: !existingUser,
          email: user.email,
          role: user.role,
        },
      }),
    ),
  ]);

  writeSessionCookie(context, token, session.expiresAt);

  return context.json(
    {
      user,
      session: publicSession(session),
      created: !existingUser,
    },
    existingUser ? 200 : 201,
  );
}

async function createInvitationResponse(
  context: AppContext,
  input: { email: string; role?: string | undefined },
  options: { createdBy: string; locale: WorkerLocale; returnToken: boolean },
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
    locale: options.locale,
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

export async function requirePermission(
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

  const fingerprint = await requestFingerprint(context);
  await context.env.DB.batch([
    prepareAuditInsert(
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
    ),
    prepareSecurityEventInsert(context.env, {
      ...fingerprint,
      eventType: "rbac.denied",
      severity: "warning",
      actorUserId: current.user.id,
      targetUserId: current.user.id,
      action: permission,
      outcome: "denied",
      sessionId: current.sessionId,
      metadata: {
        method: context.req.method,
        path: context.req.path,
        role,
      },
    }),
  ]);

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

function publicInvitationListItem(invitation: InvitationRow): Record<string, string | null> {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expires_at,
    createdBy: invitation.created_by,
    createdAt: invitation.created_at,
    acceptedAt: invitation.accepted_at,
    revokedAt: invitation.revoked_at,
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

function isLocalRuntime(context: AppContext): boolean {
  return isLocalAppEnv(context.env);
}

function writeSessionCookie(context: AppContext, token: string, expiresAt: string): void {
  const runtime = runtimeConfig(context.env);

  setCookie(context, sessionCookieName, token, {
    httpOnly: true,
    secure: runtime.APP_ENV !== "local",
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function readCurrentUser(context: AppContext): Promise<CurrentUser | null> {
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

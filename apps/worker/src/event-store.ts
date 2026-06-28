import type { AppContext } from "./http-utils";

export type RequestFingerprint = {
  requestId: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
};

export type LoginAttemptInput = RequestFingerprint & {
  emailHash: string;
  userId?: string | null | undefined;
  outcome: "succeeded" | "failed";
  failureReason?: string | null | undefined;
  createdAt?: string | undefined;
};

export type ImportJobEventInput = {
  importJobId: string;
  sourceFileId?: string | null | undefined;
  eventType: string;
  statusFrom?: string | null | undefined;
  statusTo?: string | null | undefined;
  actorUserId?: string | null | undefined;
  message?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  requestId?: string | null | undefined;
  createdAt?: string | undefined;
};

export type SecurityEventInput = RequestFingerprint & {
  eventType: string;
  severity: "info" | "warning" | "critical";
  actorUserId?: string | null | undefined;
  targetUserId?: string | null | undefined;
  action: string;
  outcome: "succeeded" | "failed" | "denied";
  sessionId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt?: string | undefined;
};

export type AlertEventInput = {
  severity: "info" | "warning" | "critical";
  alertType: string;
  entityType?: string | null | undefined;
  entityId?: string | null | undefined;
  title: string;
  message?: string | null | undefined;
  status?: "open" | "acknowledged" | "resolved" | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt?: string | undefined;
};

export type ImportJobEventRow = {
  id: string;
  import_job_id: string;
  source_file_id: string | null;
  event_type: string;
  status_from: string | null;
  status_to: string | null;
  actor_user_id: string | null;
  message: string | null;
  metadata_json: string | null;
  request_id: string | null;
  created_at: string;
};

export function prepareLoginAttemptInsert(env: Env, input: LoginAttemptInput): D1PreparedStatement {
  return env.DB.prepare(
    `
      INSERT INTO login_attempts (
        id, email_hash, user_id, outcome, failure_reason, ip_hash, user_agent_hash, request_id, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).bind(
    crypto.randomUUID(),
    input.emailHash,
    input.userId ?? null,
    input.outcome,
    input.failureReason ?? null,
    input.ipHash,
    input.userAgentHash,
    input.requestId,
    input.createdAt ?? new Date().toISOString(),
  );
}

export function prepareImportJobEventInsert(
  env: Env,
  input: ImportJobEventInput,
): D1PreparedStatement {
  return env.DB.prepare(
    `
      INSERT INTO import_job_events (
        id,
        import_job_id,
        source_file_id,
        event_type,
        status_from,
        status_to,
        actor_user_id,
        message,
        metadata_json,
        request_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).bind(
    crypto.randomUUID(),
    input.importJobId,
    input.sourceFileId ?? null,
    input.eventType,
    input.statusFrom ?? null,
    input.statusTo ?? null,
    input.actorUserId ?? null,
    input.message ?? null,
    JSON.stringify(input.metadata ?? {}),
    input.requestId ?? null,
    input.createdAt ?? new Date().toISOString(),
  );
}

export async function writeImportJobEvent(env: Env, input: ImportJobEventInput): Promise<void> {
  await prepareImportJobEventInsert(env, input).run();
}

export function prepareSecurityEventInsert(
  env: Env,
  input: SecurityEventInput,
): D1PreparedStatement {
  return env.DB.prepare(
    `
      INSERT INTO security_events (
        id,
        event_type,
        severity,
        actor_user_id,
        target_user_id,
        action,
        outcome,
        request_id,
        session_id,
        ip_hash,
        user_agent_hash,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).bind(
    crypto.randomUUID(),
    input.eventType,
    input.severity,
    input.actorUserId ?? null,
    input.targetUserId ?? null,
    input.action,
    input.outcome,
    input.requestId,
    input.sessionId ?? null,
    input.ipHash,
    input.userAgentHash,
    JSON.stringify(input.metadata ?? {}),
    input.createdAt ?? new Date().toISOString(),
  );
}

export async function writeSecurityEvent(env: Env, input: SecurityEventInput): Promise<void> {
  await prepareSecurityEventInsert(env, input).run();
}

export function prepareAlertEventInsert(env: Env, input: AlertEventInput): D1PreparedStatement {
  return env.DB.prepare(
    `
      INSERT INTO alert_events (
        id,
        severity,
        alert_type,
        entity_type,
        entity_id,
        title,
        message,
        status,
        metadata_json,
        created_at,
        acknowledged_by_user_id,
        acknowledged_at,
        resolved_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
    `,
  ).bind(
    crypto.randomUUID(),
    input.severity,
    input.alertType,
    input.entityType ?? null,
    input.entityId ?? null,
    input.title,
    input.message ?? null,
    input.status ?? "open",
    JSON.stringify(input.metadata ?? {}),
    input.createdAt ?? new Date().toISOString(),
  );
}

export async function readImportJobEvents(
  env: Env,
  input: { importJobId: string; limit: number },
): Promise<ImportJobEventRow[]> {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        source_file_id,
        event_type,
        status_from,
        status_to,
        actor_user_id,
        message,
        metadata_json,
        request_id,
        created_at
      FROM import_job_events
      WHERE import_job_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
  )
    .bind(input.importJobId, input.limit)
    .all<ImportJobEventRow>();

  return result.results;
}

export function publicImportJobEvent(row: ImportJobEventRow): Record<string, unknown> {
  return {
    id: row.id,
    importJobId: row.import_job_id,
    sourceFileId: row.source_file_id,
    eventType: row.event_type,
    statusFrom: row.status_from,
    statusTo: row.status_to,
    actorUserId: row.actor_user_id,
    message: row.message,
    metadata: row.metadata_json ? parseJsonValue(row.metadata_json) : {},
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

export async function requestFingerprint(context: AppContext): Promise<RequestFingerprint> {
  const requestId = context.req.header("cf-ray") ?? context.req.header("x-request-id") ?? null;
  const ip =
    context.req.header("cf-connecting-ip") ?? context.req.header("x-forwarded-for") ?? null;
  const userAgent = context.req.header("user-agent") ?? null;

  return {
    requestId,
    ipHash: await hashEventValue(ip),
    userAgentHash: await hashEventValue(userAgent),
  };
}

export async function hashEventValue(value: string | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseJsonValue(value: string): unknown {
  return JSON.parse(value);
}

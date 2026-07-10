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

export function prepareAlertEventInsert(
  env: Env,
  input: AlertEventInput,
  guard?: ImportJobWriteGuard,
): D1PreparedStatement {
  const statement = env.DB.prepare(
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
      ${guard ? `SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL WHERE ${activeImportJobGuardSql()}` : "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)"}
    `,
  );
  const values = [
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
  ];
  return guard
    ? statement.bind(...values, ...importJobWriteGuardBindings(guard))
    : statement.bind(...values);
}
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

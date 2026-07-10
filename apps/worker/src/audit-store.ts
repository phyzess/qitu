import type { AuditEvent } from "@qitu/audit";
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

export function prepareAuditInsert(
  env: Env,
  event: AuditEvent,
  guard?: ImportJobWriteGuard,
): D1PreparedStatement {
  const values = [
    event.id,
    event.action,
    event.actor.id,
    event.actor.kind,
    event.subject.id,
    event.subject.kind,
    JSON.stringify(event.metadata ?? {}),
    event.occurredAt,
  ];
  if (!guard) {
    return env.DB.prepare(
      `
        INSERT INTO audit_events (
          id, action, actor_id, actor_kind, subject_id, subject_kind, metadata_json, occurred_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(...values);
  }

  return env.DB.prepare(
    `
      INSERT INTO audit_events (
        id, action, actor_id, actor_kind, subject_id, subject_kind, metadata_json, occurred_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ${activeImportJobGuardSql()}
    `,
  ).bind(...values, ...importJobWriteGuardBindings(guard));
}

export async function writeAudit(env: Env, event: AuditEvent): Promise<void> {
  await prepareAuditInsert(env, event).run();
}

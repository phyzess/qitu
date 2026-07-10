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

export function prepareImportJobEventInsert(
  env: Env,
  input: ImportJobEventInput,
  guard?: ImportJobWriteGuard,
): D1PreparedStatement {
  const values = [
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
  ];
  if (!guard) {
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
    ).bind(...values);
  }

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
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ${activeImportJobGuardSql()}
    `,
  ).bind(...values, ...importJobWriteGuardBindings(guard));
}

export async function writeImportJobEvent(env: Env, input: ImportJobEventInput): Promise<void> {
  await prepareImportJobEventInsert(env, input).run();
}
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

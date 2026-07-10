import type { CommitRecordInput, StageRecordInput } from "../import-review-store";
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "../import-job-write-guard";

export function prepareInsertStarterStagedRecord(
  env: Env,
  input: StageRecordInput,
): D1PreparedStatement {
  const values = [
    input.id,
    input.importJobId,
    input.sourceFileId,
    input.stagedRecordKey,
    input.sourceRowKey,
    input.payloadJson,
    input.reviewStatus,
    input.createdAt,
    input.updatedAt,
  ];
  if (!input.writeGuard) {
    return env.DB.prepare(
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
    ).bind(...values);
  }

  return env.DB.prepare(
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
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ${activeImportJobGuardSql()}
    `,
  ).bind(...values, ...importJobWriteGuardBindings(input.writeGuard));
}

export function prepareUpdateStarterStagedRecordStatus(
  env: Env,
  input: {
    id: string;
    reviewStatus: string;
    updatedAt: string;
    onlyPending?: boolean;
    writeGuard?: ImportJobWriteGuard;
  },
): D1PreparedStatement {
  const pendingGuard = input.onlyPending ? "AND review_status = 'pending'" : "";
  const writeGuard = input.writeGuard ? `AND ${activeImportJobGuardSql()}` : "";
  const statement = env.DB.prepare(
    `
      UPDATE example_staged_records
      SET review_status = ?, updated_at = ?
      WHERE id = ?
        ${pendingGuard}
        ${writeGuard}
    `,
  );

  return input.writeGuard
    ? statement.bind(
        input.reviewStatus,
        input.updatedAt,
        input.id,
        ...importJobWriteGuardBindings(input.writeGuard),
      )
    : statement.bind(input.reviewStatus, input.updatedAt, input.id);
}

export function prepareAdjustStarterStagedRecord(
  env: Env,
  input: { id: string; payloadJson: string; reviewStatus: string; updatedAt: string },
): D1PreparedStatement {
  return env.DB.prepare(
    `
      UPDATE example_staged_records
      SET payload_json = ?, review_status = ?, updated_at = ?
      WHERE id = ? AND review_status != 'committed'
    `,
  ).bind(input.payloadJson, input.reviewStatus, input.updatedAt, input.id);
}

export function prepareInsertStarterCommittedRecord(
  env: Env,
  input: CommitRecordInput,
): D1PreparedStatement {
  const values = [
    input.id,
    input.record.import_job_id,
    input.record.source_file_id,
    input.record.staged_record_key,
    input.payloadJson,
    input.committedBy,
    input.committedAt,
  ];
  if (!input.writeGuard) {
    return env.DB.prepare(
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
    ).bind(...values);
  }

  return env.DB.prepare(
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
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE ${activeImportJobGuardSql()}
    `,
  ).bind(...values, ...importJobWriteGuardBindings(input.writeGuard));
}

export function prepareMarkStarterStagedRecordCommitted(
  env: Env,
  input: {
    id: string;
    committedRecordId: string;
    updatedAt: string;
    writeGuard?: ImportJobWriteGuard;
  },
): D1PreparedStatement {
  const statement = env.DB.prepare(
    `
      UPDATE example_staged_records
      SET review_status = 'committed', committed_record_id = ?, updated_at = ?
      WHERE id = ? AND review_status = 'approved' AND committed_record_id IS NULL
        ${input.writeGuard ? `AND ${activeImportJobGuardSql()}` : ""}
    `,
  );
  return input.writeGuard
    ? statement.bind(
        input.committedRecordId,
        input.updatedAt,
        input.id,
        ...importJobWriteGuardBindings(input.writeGuard),
      )
    : statement.bind(input.committedRecordId, input.updatedAt, input.id);
}

export function prepareDeleteStarterSourceRecords(
  env: Env,
  input: { sourceFileId: string },
): D1PreparedStatement[] {
  return [
    env.DB.prepare("DELETE FROM example_committed_records WHERE source_file_id = ?").bind(
      input.sourceFileId,
    ),
    env.DB.prepare("DELETE FROM example_staged_records WHERE source_file_id = ?").bind(
      input.sourceFileId,
    ),
  ];
}

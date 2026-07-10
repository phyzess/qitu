import { createAuditEvent } from "@qitu/audit";
import type { ReviewIssue } from "@qitu/import-pipeline";
import { prepareAuditInsert } from "./audit-store";
import type { WorkerImportAdapter } from "./import-adapters";
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

export type StagedImportRow = {
  id: string;
  issues: ReviewIssue[];
  payloadJson: string;
  sourceRowKey: string;
  stagedRecordKey: string;
};

export function prepareStagedImportRowStatements(
  env: Env,
  input: {
    adapter: WorkerImportAdapter;
    importJobId: string;
    row: StagedImportRow;
    sourceFileId: string;
    stagedAt: string;
    writeGuard: ImportJobWriteGuard;
  },
): D1PreparedStatement[] {
  const { adapter, importJobId, row, sourceFileId, stagedAt, writeGuard } = input;

  return [
    adapter.reviewStore.prepareInsertStagedRecord(env, {
      id: row.id,
      importJobId,
      sourceFileId,
      stagedRecordKey: row.stagedRecordKey,
      sourceRowKey: row.sourceRowKey,
      payloadJson: row.payloadJson,
      reviewStatus: "pending",
      createdAt: stagedAt,
      updatedAt: stagedAt,
      writeGuard,
    }),
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
          SELECT ?, ?, ?, ?, ?, ?, ?, ?
          WHERE ${activeImportJobGuardSql()}
        `,
      ).bind(
        crypto.randomUUID(),
        importJobId,
        row.stagedRecordKey,
        issue.code,
        issue.message,
        issue.severity,
        "open",
        stagedAt,
        ...importJobWriteGuardBindings(writeGuard),
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
          kind: adapter.reviewStore.stagedRecordSubjectKind,
        },
        metadata: {
          importJobId,
          sourceFileId,
          stagedRecordKey: row.stagedRecordKey,
          adapterId: adapter.id,
        },
      }),
      writeGuard,
    ),
  ];
}

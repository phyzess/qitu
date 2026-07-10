import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import type { WorkerImportAdapter } from "./import-adapters";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import type { ImportReviewIssueRow } from "./import-review-row-types";
import type { StoredStagedRecordRow } from "./import-review-store";

export function prepareOpenErrorOverrideStatements(
  env: Env,
  input: {
    acceptedAt: string;
    actorUserId: string;
    adapter: WorkerImportAdapter;
    decisionId: string;
    importJobId: string;
    issues: ImportReviewIssueRow[];
    record: StoredStagedRecordRow;
  },
): D1PreparedStatement[] {
  if (input.issues.length === 0) {
    return [];
  }

  const issueIds = input.issues.map((issue) => issue.id);
  const issuePlaceholders = issueIds.map(() => "?").join(", ");
  return [
    env.DB.prepare(
      `
        UPDATE import_review_issues
        SET status = 'accepted'
        WHERE import_job_id = ?
          AND staged_record_key = ?
          AND id IN (${issuePlaceholders})
          AND severity = 'error'
          AND status = 'open'
      `,
    ).bind(input.importJobId, input.record.staged_record_key, ...issueIds),
    prepareImportJobEventInsert(env, {
      importJobId: input.importJobId,
      sourceFileId: input.record.source_file_id,
      eventType: "import_review.open_errors_accepted",
      actorUserId: input.actorUserId,
      message: "Open validation errors explicitly accepted for a staged record.",
      createdAt: input.acceptedAt,
      metadata: {
        decisionId: input.decisionId,
        stagedRecordKey: input.record.staged_record_key,
        issueIds,
        issueCodes: input.issues.map((issue) => issue.code),
      },
    }),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: "import_review.open_errors_accepted",
        actor: {
          id: input.actorUserId,
          kind: "user",
        },
        subject: {
          id: input.record.id,
          kind: input.adapter.reviewStore.stagedRecordSubjectKind,
        },
        metadata: {
          importJobId: input.importJobId,
          stagedRecordKey: input.record.staged_record_key,
          decisionId: input.decisionId,
          issueIds,
          issueCodes: input.issues.map((issue) => issue.code),
        },
      }),
    ),
  ];
}

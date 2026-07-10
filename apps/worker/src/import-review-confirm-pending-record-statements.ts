import { createAuditEvent } from "@qitu/audit";
import type { ReviewRecordDecisionAction } from "@qitu/import-pipeline";
import { prepareAuditInsert } from "./audit-store";
import type { WorkerImportAdapter } from "./import-adapters";
import type { StoredStagedRecordRow } from "./import-review-store";
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

export function prepareConfirmPendingRecordStatements(
  env: Env,
  input: {
    action: ReviewRecordDecisionAction;
    actorKind: "system" | "user";
    adapter: WorkerImportAdapter;
    automatic: boolean;
    confirmedAt: string;
    currentUserId: string;
    decisionId: string;
    jobId: string;
    note: string | null;
    record: StoredStagedRecordRow;
    requestedByUserId?: string;
    targetStatus: string;
    writeGuard?: ImportJobWriteGuard;
  },
): D1PreparedStatement[] {
  const recordDecisionId = crypto.randomUUID();

  return [
    env.DB.prepare(
      `
        INSERT INTO import_review_record_decisions (
          id, decision_id, import_job_id, staged_record_key, action, note, created_at
        )
        ${input.writeGuard ? `SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${activeImportJobGuardSql()}` : "VALUES (?, ?, ?, ?, ?, ?, ?)"}
      `,
    ).bind(
      recordDecisionId,
      input.decisionId,
      input.jobId,
      input.record.staged_record_key,
      input.action,
      input.note,
      input.confirmedAt,
      ...(input.writeGuard ? importJobWriteGuardBindings(input.writeGuard) : []),
    ),
    input.adapter.reviewStore.prepareUpdateStagedRecordStatus(env, {
      id: input.record.id,
      reviewStatus: input.targetStatus,
      updatedAt: input.confirmedAt,
      onlyPending: true,
      ...(input.writeGuard ? { writeGuard: input.writeGuard } : {}),
    }),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: `import_review.record_${input.targetStatus}`,
        actor: {
          id: input.currentUserId,
          kind: input.actorKind,
        },
        subject: {
          id: input.record.id,
          kind: input.adapter.reviewStore.stagedRecordSubjectKind,
        },
        metadata: {
          importJobId: input.jobId,
          stagedRecordKey: input.record.staged_record_key,
          decisionId: input.decisionId,
          recordDecisionId,
          batch: true,
          automatic: input.automatic,
          requestedByUserId: input.requestedByUserId ?? null,
        },
      }),
      input.writeGuard,
    ),
  ];
}

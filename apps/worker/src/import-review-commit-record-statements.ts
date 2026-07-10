import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import type { WorkerImportAdapter } from "./import-adapters";
import type { CommittedRecordPair } from "./import-review-commit-types";
import type { ImportJobWriteGuard } from "./import-job-write-guard";

export function prepareCommittedRecordStatements(
  env: Env,
  input: {
    actorKind: "system" | "user";
    adapter: WorkerImportAdapter;
    automatic: boolean;
    committedAt: string;
    currentUserId: string;
    jobId: string;
    pair: CommittedRecordPair;
    requestedByUserId?: string;
    writeGuard?: ImportJobWriteGuard;
  },
): D1PreparedStatement[] {
  const { committedRecord, record } = input.pair;

  return [
    input.adapter.reviewStore.prepareInsertCommittedRecord(env, {
      id: committedRecord.id,
      record,
      payloadJson: committedRecord.payload_json,
      committedBy: input.currentUserId,
      committedAt: input.committedAt,
      ...(input.writeGuard ? { writeGuard: input.writeGuard } : {}),
    }),
    input.adapter.reviewStore.prepareMarkStagedRecordCommitted(env, {
      id: record.id,
      committedRecordId: committedRecord.id,
      updatedAt: input.committedAt,
      ...(input.writeGuard ? { writeGuard: input.writeGuard } : {}),
    }),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: "import_review.record_committed",
        actor: {
          id: input.currentUserId,
          kind: input.actorKind,
        },
        subject: {
          id: record.id,
          kind: input.adapter.reviewStore.stagedRecordSubjectKind,
        },
        metadata: {
          importJobId: input.jobId,
          stagedRecordKey: record.staged_record_key,
          committedRecordId: committedRecord.id,
          adapterId: input.adapter.id,
          automatic: input.automatic,
          requestedByUserId: input.requestedByUserId ?? null,
        },
      }),
      input.writeGuard,
    ),
  ];
}

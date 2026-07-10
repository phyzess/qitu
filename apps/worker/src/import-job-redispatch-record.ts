import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import type { ImportJobReviewRow } from "./import-review-row-types";
import {
  prepareImportJobWriteGuardAssertion,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

type ImportJobRedispatchRecordInput = {
  actorUserId: string;
  job: ImportJobReviewRow;
  now: string;
  reason?: string | undefined;
  requestId: string | null;
  writeGuard: ImportJobWriteGuard;
};

export function prepareImportJobRedispatchSucceededStatements(
  env: Env,
  input: ImportJobRedispatchRecordInput,
): D1PreparedStatement[] {
  return prepareImportJobRedispatchStatements(env, input, {
    action: "import_job.dispatch_retried",
    message: "Queued import job was dispatched again.",
  });
}

export function prepareImportJobRedispatchFailedStatements(
  env: Env,
  input: ImportJobRedispatchRecordInput,
): D1PreparedStatement[] {
  return prepareImportJobRedispatchStatements(env, input, {
    action: "import_job.dispatch_retry_failed",
    message: input.reason ?? "Queue dispatch failed.",
  });
}

function prepareImportJobRedispatchStatements(
  env: Env,
  input: ImportJobRedispatchRecordInput,
  outcome: { action: string; message: string },
): D1PreparedStatement[] {
  const metadata = {
    objectKey: input.job.object_key,
    ...(input.reason ? { reason: input.reason } : {}),
    sourceFileId: input.job.source_file_id,
  };

  return [
    prepareImportJobWriteGuardAssertion(env, input.writeGuard),
    prepareImportJobEventInsert(env, {
      actorUserId: input.actorUserId,
      createdAt: input.now,
      eventType: outcome.action,
      importJobId: input.job.id,
      message: outcome.message,
      metadata,
      requestId: input.requestId,
      sourceFileId: input.job.source_file_id,
      statusFrom: "queued",
      statusTo: "queued",
    }),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: outcome.action,
        actor: {
          id: input.actorUserId,
          kind: "user",
        },
        metadata,
        subject: {
          id: input.job.id,
          kind: "import_job",
        },
      }),
    ),
  ];
}

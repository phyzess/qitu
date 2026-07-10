import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import type { WorkerImportAdapter } from "./import-adapters";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import type { ImportJobReviewRow } from "./import-review-row-types";
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";

export function prepareImportJobCommittedStatements(
  env: Env,
  input: {
    actorKind: "system" | "user";
    adapter: WorkerImportAdapter;
    automatic: boolean;
    committedAt: string;
    committedCount: number;
    currentUserId: string;
    job: ImportJobReviewRow;
    jobId: string;
    jobStatusAfterCommit: string;
    requestedByUserId?: string;
    writeGuard?: ImportJobWriteGuard;
  },
): D1PreparedStatement[] {
  const update = env.DB.prepare(
    `
      UPDATE import_jobs
      SET
        status = ?,
        mutation_token = NULL,
        mutation_started_at = NULL,
        mutation_kind = NULL,
        mutation_previous_status = NULL,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
        ${input.writeGuard ? `AND ${activeImportJobGuardSql()}` : ""}
    `,
  );
  const committedGuard = input.writeGuard
    ? {
        importJobId: input.writeGuard.importJobId,
        processingStartedAt: input.writeGuard.processingStartedAt,
        status: input.jobStatusAfterCommit,
      }
    : undefined;
  return [
    input.writeGuard
      ? update.bind(
          input.jobStatusAfterCommit,
          input.committedAt,
          input.committedAt,
          input.jobId,
          ...importJobWriteGuardBindings(input.writeGuard),
        )
      : update.bind(input.jobStatusAfterCommit, input.committedAt, input.committedAt, input.jobId),
    prepareImportJobEventInsert(
      env,
      {
        importJobId: input.jobId,
        sourceFileId: input.job.source_file_id,
        eventType: "import_job.committed",
        statusFrom: input.writeGuard?.status ?? input.job.status,
        statusTo: input.jobStatusAfterCommit,
        actorUserId: input.actorKind === "user" ? input.currentUserId : null,
        message: "Approved staged records committed.",
        createdAt: input.committedAt,
        metadata: {
          committedCount: input.committedCount,
          adapterId: input.adapter.id,
          jobStatusAfterCommit: input.jobStatusAfterCommit,
          automatic: input.automatic,
          executedBy: input.currentUserId,
          requestedByUserId: input.requestedByUserId ?? null,
        },
      },
      committedGuard,
    ),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: "import_job.committed",
        actor: {
          id: input.currentUserId,
          kind: input.actorKind,
        },
        subject: {
          id: input.jobId,
          kind: "import_job",
        },
        metadata: {
          sourceFileId: input.job.source_file_id,
          committedCount: input.committedCount,
          adapterId: input.adapter.id,
          automatic: input.automatic,
          requestedByUserId: input.requestedByUserId ?? null,
        },
      }),
      committedGuard,
    ),
  ];
}

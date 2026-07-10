import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import {
  activeImportJobGuardSql,
  importJobWriteGuardBindings,
  type ImportJobWriteGuard,
} from "./import-job-write-guard";
import {
  IMPORT_DISPATCH_MUTATION_LEASE_MS,
  IMPORT_REVIEW_MUTATION_LEASE_MS,
} from "./import-review-mutation-claim";

export async function voidImportJob(
  env: Env,
  input: {
    actorUserId: string;
    importJobId: string;
    reason: string;
    note?: string | null;
    sourceFileId: string;
    statusFrom: string;
    voidedAt: string;
  },
): Promise<boolean> {
  if (input.statusFrom === "voided") return true;
  if (input.statusFrom === "committing") return false;

  const transitionToken = `void:${crypto.randomUUID()}`;
  const mutationStaleBefore = new Date(Date.now() - IMPORT_REVIEW_MUTATION_LEASE_MS).toISOString();
  const dispatchMutationStaleBefore = new Date(
    Date.now() - IMPORT_DISPATCH_MUTATION_LEASE_MS,
  ).toISOString();
  const update = env.DB.prepare(
    `
      UPDATE import_jobs
      SET
        status = 'voided',
        processing_started_at = NULL,
        processing_owner = NULL,
        processing_lease_expires_at = NULL,
        mutation_token = ?,
        mutation_started_at = ?,
        mutation_kind = 'void',
        mutation_previous_status = NULL,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
        AND status = ?
        AND status != 'committing'
        AND (
          mutation_token IS NULL
          OR (
            mutation_kind IN ('retry', 'redispatch')
            AND mutation_started_at <= ?
          )
          OR (
            (
              mutation_kind IS NULL
              OR mutation_kind NOT IN ('retry', 'redispatch')
            )
            AND mutation_started_at <= ?
          )
        )
    `,
  ).bind(
    transitionToken,
    input.voidedAt,
    input.voidedAt,
    input.voidedAt,
    input.importJobId,
    input.statusFrom,
    dispatchMutationStaleBefore,
    mutationStaleBefore,
  );
  const writeGuard: ImportJobWriteGuard = {
    allowInactiveSource: true,
    importJobId: input.importJobId,
    mutationToken: transitionToken,
    processingStartedAt: null,
    status: "voided",
    updatedAt: input.voidedAt,
  };
  const decision = env.DB.prepare(
    `
      INSERT INTO import_review_decisions (
        id, import_job_id, action, reviewer_user_id, note, created_at
      )
      SELECT ?, ?, 'void', ?, ?, ?
      WHERE ${activeImportJobGuardSql()}
    `,
  ).bind(
    crypto.randomUUID(),
    input.importJobId,
    input.actorUserId,
    input.note ?? null,
    input.voidedAt,
    ...importJobWriteGuardBindings(writeGuard),
  );
  const [result] = await env.DB.batch([
    update,
    decision,
    prepareImportJobEventInsert(
      env,
      {
        importJobId: input.importJobId,
        sourceFileId: input.sourceFileId,
        eventType: "import_job.voided",
        statusFrom: input.statusFrom,
        statusTo: "voided",
        actorUserId: input.actorUserId,
        message: "Import job voided.",
        createdAt: input.voidedAt,
        metadata: {
          reason: input.reason,
          note: input.note ?? null,
        },
      },
      writeGuard,
    ),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: "import_job.voided",
        actor: {
          id: input.actorUserId,
          kind: "user",
        },
        subject: {
          id: input.importJobId,
          kind: "import_job",
        },
        metadata: {
          sourceFileId: input.sourceFileId,
          statusFrom: input.statusFrom,
          reason: input.reason,
          note: input.note ?? null,
        },
      }),
      writeGuard,
    ),
    env.DB.prepare(
      `
        UPDATE import_jobs
        SET
          mutation_token = NULL,
          mutation_started_at = NULL,
          mutation_kind = NULL,
          mutation_previous_status = NULL
        WHERE id = ? AND status = 'voided' AND mutation_token = ?
      `,
    ).bind(input.importJobId, transitionToken),
  ]);

  if ((result?.meta.changes ?? 0) === 0) return false;

  return true;
}

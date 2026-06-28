import { createAuditEvent } from "@qitu/audit";
import {
  createManualReviewIssue,
  sourceRowKeyForIndex,
  stagedRecordKeyForSourceRow,
  type ImportFailureClass,
} from "@qitu/import-pipeline";
import type { ImportJobMessage } from "@qitu/jobs";
import { prepareAuditInsert } from "./audit-store";
import { prepareAlertEventInsert, prepareImportJobEventInsert } from "./event-store";
import { getImportAdapter } from "./import-adapters";

type ImportProcessingJobRow = {
  id: string;
  source_file_id: string;
  status: string;
  job_kind: string | null;
  adapter_id: string | null;
  failure_reason: string | null;
  failure_class: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  filename: string;
  content_type: string;
  object_key: string;
};

export async function processImportJob(env: Env, body: ImportJobMessage): Promise<void> {
  const now = new Date().toISOString();

  try {
    const job = await env.DB.prepare(
      `
        SELECT
          import_jobs.id,
          import_jobs.source_file_id,
          import_jobs.status,
          import_jobs.job_kind,
          import_jobs.adapter_id,
          import_jobs.failure_reason,
          import_jobs.failure_class,
          import_jobs.created_by,
          import_jobs.created_at,
          import_jobs.updated_at,
          import_jobs.completed_at,
          source_files.filename,
          source_files.content_type,
          source_files.object_key
        FROM import_jobs
        INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
        WHERE import_jobs.id = ?
        LIMIT 1
      `,
    )
      .bind(body.jobId)
      .first<ImportProcessingJobRow>();

    if (!job || job.status !== "queued") {
      return;
    }

    const adapter = getImportAdapter(job.adapter_id);
    if (!adapter) {
      await markImportJobFailed(env, {
        jobId: body.jobId,
        sourceFileId: body.sourceFileId,
        reason: `Import adapter is not registered: ${job.adapter_id ?? "none"}.`,
        action: "import_job.adapter_missing",
        failureClass: "adapter_missing",
      });
      return;
    }

    const processingResult = await env.DB.prepare(
      `
        UPDATE import_jobs
        SET
          status = 'processing',
          processing_started_at = ?,
          completed_at = NULL,
          failure_reason = NULL,
          failure_class = NULL,
          updated_at = ?,
          attempt_count = COALESCE(attempt_count, 0) + 1
        WHERE id = ? AND status = 'queued'
      `,
    )
      .bind(now, now, body.jobId)
      .run();

    if ((processingResult.meta.changes ?? 0) === 0) {
      return;
    }

    await env.DB.batch([
      prepareImportJobEventInsert(env, {
        importJobId: body.jobId,
        sourceFileId: body.sourceFileId,
        eventType: "import_job.processing_started",
        statusFrom: "queued",
        statusTo: "processing",
        message: "Import job processing started.",
        createdAt: now,
        metadata: {
          objectKey: body.objectKey,
          adapterId: adapter.id,
        },
      }),
      prepareAuditInsert(
        env,
        createAuditEvent({
          action: "import_job.processing_started",
          actor: {
            id: "queue",
            kind: "system",
          },
          subject: {
            id: body.jobId,
            kind: "import_job",
          },
          metadata: {
            sourceFileId: body.sourceFileId,
            objectKey: body.objectKey,
            adapterId: adapter.id,
          },
        }),
      ),
    ]);

    const sourceObject = await env.SOURCE_FILES.get(body.objectKey);
    if (!sourceObject) {
      await markImportJobFailed(env, {
        jobId: body.jobId,
        sourceFileId: body.sourceFileId,
        reason: "Source object was not found in R2.",
        action: "import_job.source_missing",
        failureClass: "source_missing",
      });
      return;
    }

    const stagedAt = new Date().toISOString();
    const stagedRecords = await adapter.parseAndStage(sourceObject.body);
    if (stagedRecords.length === 0) {
      await markImportJobFailed(env, {
        jobId: body.jobId,
        sourceFileId: body.sourceFileId,
        reason: "Import adapter did not produce any staged records.",
        action: "import_job.no_records",
        failureClass: "validation",
      });
      return;
    }

    const stagedRows = await Promise.all(
      stagedRecords.map(async (record, index) => {
        const rowIndex = index + 1;
        const stagedRecordKey = stagedRecordKeyForSourceRow({
          sourceFileId: body.sourceFileId,
          rowIndex,
        });
        const existingStagedRecord = await env.DB.prepare(
          `
            SELECT id
            FROM example_staged_records
            WHERE import_job_id = ? AND staged_record_key = ?
            LIMIT 1
          `,
        )
          .bind(body.jobId, stagedRecordKey)
          .first<{ id: string }>();

        return {
          id: existingStagedRecord?.id ?? crypto.randomUUID(),
          stagedRecordKey,
          sourceRowKey: sourceRowKeyForIndex(rowIndex),
          payloadJson: JSON.stringify(record.payload),
          issues: [createManualReviewIssue(), ...record.issues],
        };
      }),
    );

    await env.DB.batch([
      ...stagedRows.flatMap((row) => [
        env.DB.prepare(
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
        ).bind(
          row.id,
          body.jobId,
          body.sourceFileId,
          row.stagedRecordKey,
          row.sourceRowKey,
          row.payloadJson,
          "pending",
          stagedAt,
          stagedAt,
        ),
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
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
          ).bind(
            crypto.randomUUID(),
            body.jobId,
            row.stagedRecordKey,
            issue.code,
            issue.message,
            issue.severity,
            "open",
            stagedAt,
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
              kind: "example_staged_record",
            },
            metadata: {
              importJobId: body.jobId,
              sourceFileId: body.sourceFileId,
              stagedRecordKey: row.stagedRecordKey,
              adapterId: adapter.id,
            },
          }),
        ),
      ]),
      env.DB.prepare(
        `
          UPDATE import_jobs
          SET status = 'needs_review', completed_at = ?, updated_at = ?
          WHERE id = ?
        `,
      ).bind(stagedAt, stagedAt, body.jobId),
      prepareImportJobEventInsert(env, {
        importJobId: body.jobId,
        sourceFileId: body.sourceFileId,
        eventType: "import_job.needs_review",
        statusFrom: "processing",
        statusTo: "needs_review",
        message: "Import job is ready for human review.",
        createdAt: stagedAt,
        metadata: {
          objectKey: body.objectKey,
          adapterId: adapter.id,
          stagedCount: stagedRows.length,
        },
      }),
      prepareAuditInsert(
        env,
        createAuditEvent({
          action: "import_job.needs_review",
          actor: {
            id: "queue",
            kind: "system",
          },
          subject: {
            id: body.jobId,
            kind: "import_job",
          },
          metadata: {
            sourceFileId: body.sourceFileId,
            objectKey: body.objectKey,
            adapterId: adapter.id,
            stagedCount: stagedRows.length,
          },
        }),
      ),
    ]);
  } catch (error) {
    await markImportJobFailed(env, {
      jobId: body.jobId,
      sourceFileId: body.sourceFileId,
      reason: error instanceof Error ? error.message : "Import job processing failed.",
      action: "import_job.failed",
      failureClass: "processing",
    });
  }
}

export async function markImportJobFailed(
  env: Env,
  input: {
    jobId: string;
    sourceFileId?: string | null | undefined;
    reason: string;
    action: string;
    failureClass?: ImportFailureClass | undefined;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const failureClass = input.failureClass ?? "infrastructure";
  await env.DB.batch([
    env.DB.prepare(
      `
        UPDATE import_jobs
        SET
          status = 'failed',
          failure_reason = ?,
          failure_class = ?,
          completed_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
    ).bind(input.reason, failureClass, now, now, input.jobId),
    prepareImportJobEventInsert(env, {
      importJobId: input.jobId,
      sourceFileId: input.sourceFileId ?? null,
      eventType: input.action,
      statusTo: "failed",
      message: input.reason,
      createdAt: now,
      metadata: {
        failureClass,
      },
    }),
    prepareAlertEventInsert(env, {
      severity:
        failureClass === "infrastructure" || failureClass === "queue_dispatch"
          ? "critical"
          : "warning",
      alertType: "import_job.failed",
      entityType: "import_job",
      entityId: input.jobId,
      title: "Import job failed",
      message: input.reason,
      createdAt: now,
      metadata: {
        action: input.action,
        failureClass,
        sourceFileId: input.sourceFileId ?? null,
      },
    }),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: input.action,
        actor: {
          id: "queue",
          kind: "system",
        },
        subject: {
          id: input.jobId,
          kind: "import_job",
        },
        metadata: {
          reason: input.reason,
          failureClass,
        },
      }),
    ),
  ]);
}

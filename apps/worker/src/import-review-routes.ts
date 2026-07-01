import { createAuditEvent } from "@qitu/audit";
import {
  jobStatusForReviewSummary,
  stagedStatusForReviewAction,
  type CommitApprovedContext,
  type ImportJobStatus,
  type ReviewRecordDecisionAction,
  type ReviewStatusSummary,
  type StagedRecordStatus,
} from "@qitu/import-pipeline";
import type { Hono } from "hono";
import * as v from "valibot";
import { prepareAuditInsert } from "./audit-store";
import { readCurrentUser, requirePermission } from "./auth-routes";
import { prepareImportJobEventInsert } from "./event-store";
import { authError, parseRequestJson, type AppContext } from "./http-utils";
import { getImportAdapter } from "./import-adapters";

const ReviewDecisionInputSchema = v.object({
  note: v.optional(v.string()),
});

export type ImportJobReviewRow = {
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

type ExampleStagedRecordRow = {
  id: string;
  import_job_id: string;
  source_file_id: string;
  staged_record_key: string;
  source_row_key: string;
  payload_json: string;
  review_status: string;
  committed_record_id: string | null;
  created_at: string;
  updated_at: string;
};

type ExampleCommittedRecordRow = {
  id: string;
  import_job_id: string;
  source_file_id: string;
  staged_record_key: string;
  payload_json: string;
  committed_by: string;
  committed_at: string;
};

type ImportReviewIssueRow = {
  id: string;
  import_job_id: string;
  staged_record_key: string;
  code: string;
  message: string;
  severity: string;
  status: string;
  created_at: string;
};

type ReviewStatusCountRow = {
  review_status: string;
  count: number;
};

export function registerImportReviewRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/import-jobs/:jobId/review", async (context) => {
    const current = await readCurrentUser(context);
    if (!current) {
      return authError(context, "unauthorized", "Login is required.", 401);
    }

    const jobId = context.req.param("jobId");
    const job = await readImportJobReview(context.env, jobId);
    if (!job) {
      return authError(context, "import_job_not_found", "Import job was not found.", 404);
    }

    const [recordsResult, issuesResult] = await Promise.all([
      context.env.DB.prepare(
        `
          SELECT
            id,
            import_job_id,
            source_file_id,
            staged_record_key,
            source_row_key,
            payload_json,
            review_status,
            committed_record_id,
            created_at,
            updated_at
          FROM example_staged_records
          WHERE import_job_id = ?
          ORDER BY created_at ASC
        `,
      )
        .bind(jobId)
        .all<ExampleStagedRecordRow>(),
      context.env.DB.prepare(
        `
          SELECT
            id,
            import_job_id,
            staged_record_key,
            code,
            message,
            severity,
            status,
            created_at
          FROM import_review_issues
          WHERE import_job_id = ?
          ORDER BY created_at ASC
        `,
      )
        .bind(jobId)
        .all<ImportReviewIssueRow>(),
    ]);

    return context.json({
      job: publicImportJobReview(job),
      records: recordsResult.results.map(publicExampleStagedRecord),
      issues: issuesResult.results.map(publicImportReviewIssue),
    });
  });

  app.post("/api/import-jobs/:jobId/staged-records/:recordId/approve", async (context) => {
    return recordReviewDecisionResponse(context, "approve");
  });

  app.post("/api/import-jobs/:jobId/staged-records/:recordId/reject", async (context) => {
    return recordReviewDecisionResponse(context, "reject");
  });

  app.post("/api/import-jobs/:jobId/review/confirm-pending", async (context) => {
    return confirmPendingReviewRecordsResponse(context);
  });

  app.post("/api/import-jobs/:jobId/commit", async (context) => {
    const current = await readCurrentUser(context);
    if (!current) {
      return authError(context, "unauthorized", "Login is required.", 401);
    }
    const denied = await requirePermission(context, current, "import_job:commit");
    if (denied) return denied;

    const jobId = context.req.param("jobId");
    const job = await readImportJobReview(context.env, jobId);
    if (!job) {
      return authError(context, "import_job_not_found", "Import job was not found.", 404);
    }

    const adapter = getImportAdapter(job.adapter_id);
    if (!adapter) {
      return authError(
        context,
        "import_adapter_not_found",
        "Import adapter is not registered for this job.",
        409,
      );
    }

    const recordsResult = await context.env.DB.prepare(
      `
        SELECT
          id,
          import_job_id,
          source_file_id,
          staged_record_key,
          source_row_key,
          payload_json,
          review_status,
          committed_record_id,
          created_at,
          updated_at
        FROM example_staged_records
        WHERE import_job_id = ?
          AND review_status = 'approved'
          AND committed_record_id IS NULL
        ORDER BY created_at ASC
      `,
    )
      .bind(jobId)
      .all<ExampleStagedRecordRow>();

    const approvedRecords = recordsResult.results;
    if (approvedRecords.length === 0) {
      const committedResult = await context.env.DB.prepare(
        `
          SELECT
            id,
            import_job_id,
            source_file_id,
            staged_record_key,
            payload_json,
            committed_by,
            committed_at
          FROM example_committed_records
          WHERE import_job_id = ?
          ORDER BY committed_at ASC
        `,
      )
        .bind(jobId)
        .all<ExampleCommittedRecordRow>();

      if (committedResult.results.length > 0) {
        return context.json({
          importJobId: jobId,
          status: job.status,
          duplicate: true,
          committedRecords: committedResult.results.map(publicExampleCommittedRecord),
        });
      }

      return authError(
        context,
        "no_approved_records",
        "No approved staged records are available to commit.",
        409,
      );
    }

    const now = new Date().toISOString();
    const commitContext: CommitApprovedContext = {
      importJobId: jobId,
      reviewerId: current.user.id,
      approvedStagedRecordKeys: approvedRecords.map((record) => record.staged_record_key),
      idempotencyKey: `commit:${jobId}`,
    };
    const committedPayloads = await adapter.commitApproved(
      approvedRecords.map((record) => parseJsonValue(record.payload_json)),
      commitContext,
    );

    if (committedPayloads.length !== approvedRecords.length) {
      return authError(
        context,
        "commit_result_mismatch",
        "Import adapter returned a mismatched number of committed records.",
        409,
      );
    }

    const committedRecords = approvedRecords.map((record, index) => ({
      id: crypto.randomUUID(),
      record,
      payloadJson: JSON.stringify(committedPayloads[index]),
    }));
    const jobStatusAfterCommit = await readImportJobStatusAfterCommit(
      context.env,
      jobId,
      committedRecords.length,
    );

    await context.env.DB.batch([
      ...committedRecords.flatMap(({ id, record, payloadJson }) => [
        context.env.DB.prepare(
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
        ).bind(
          id,
          record.import_job_id,
          record.source_file_id,
          record.staged_record_key,
          payloadJson,
          current.user.id,
          now,
        ),
        context.env.DB.prepare(
          `
            UPDATE example_staged_records
            SET review_status = 'committed', committed_record_id = ?, updated_at = ?
            WHERE id = ? AND review_status = 'approved' AND committed_record_id IS NULL
          `,
        ).bind(id, now, record.id),
        prepareAuditInsert(
          context.env,
          createAuditEvent({
            action: "import_review.record_committed",
            actor: {
              id: current.user.id,
              kind: "user",
            },
            subject: {
              id: record.id,
              kind: "example_staged_record",
            },
            metadata: {
              importJobId: jobId,
              stagedRecordKey: record.staged_record_key,
              committedRecordId: id,
              adapterId: adapter.id,
            },
          }),
        ),
      ]),
      context.env.DB.prepare(
        `
          UPDATE import_jobs
          SET status = ?, completed_at = ?, updated_at = ?
          WHERE id = ?
        `,
      ).bind(jobStatusAfterCommit, now, now, jobId),
      prepareImportJobEventInsert(context.env, {
        importJobId: jobId,
        sourceFileId: job.source_file_id,
        eventType: "import_job.committed",
        statusTo: jobStatusAfterCommit,
        actorUserId: current.user.id,
        message: "Approved staged records committed.",
        createdAt: now,
        metadata: {
          committedCount: committedRecords.length,
          adapterId: adapter.id,
          jobStatusAfterCommit,
        },
      }),
      prepareAuditInsert(
        context.env,
        createAuditEvent({
          action: "import_job.committed",
          actor: {
            id: current.user.id,
            kind: "user",
          },
          subject: {
            id: jobId,
            kind: "import_job",
          },
          metadata: {
            sourceFileId: job.source_file_id,
            committedCount: committedRecords.length,
            adapterId: adapter.id,
          },
        }),
      ),
    ]);

    return context.json({
      importJobId: jobId,
      status: jobStatusAfterCommit,
      committedRecords: committedRecords.map(({ id, record, payloadJson }) =>
        publicExampleCommittedRecord({
          id,
          import_job_id: record.import_job_id,
          source_file_id: record.source_file_id,
          staged_record_key: record.staged_record_key,
          payload_json: payloadJson,
          committed_by: current.user.id,
          committed_at: now,
        }),
      ),
    });
  });
}

async function confirmPendingReviewRecordsResponse(context: AppContext): Promise<Response> {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "review:decide");
  if (denied) return denied;

  const input = await parseRequestJson(context, ReviewDecisionInputSchema);
  if (!input.ok) return input.response;

  const jobId = context.req.param("jobId");
  if (!jobId) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  const recordsResult = await context.env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        source_file_id,
        staged_record_key,
        source_row_key,
        payload_json,
        review_status,
        committed_record_id,
        created_at,
        updated_at
      FROM example_staged_records
      WHERE import_job_id = ?
        AND review_status = 'pending'
      ORDER BY created_at ASC
    `,
  )
    .bind(jobId)
    .all<ExampleStagedRecordRow>();
  const pendingRecords = recordsResult.results;

  if (pendingRecords.length === 0) {
    return context.json({
      importJobId: jobId,
      status: job.status,
      confirmedCount: 0,
      records: [],
      duplicate: true,
    });
  }

  const now = new Date().toISOString();
  const note = input.value.note ?? null;
  const action: ReviewRecordDecisionAction = "approve";
  const targetStatus = stagedStatusForReviewAction(action);
  const decisionId = crypto.randomUUID();
  const summary = await readReviewStatusSummary(context.env, jobId);
  adjustReviewStatus(summary, "pending", -pendingRecords.length);
  adjustReviewStatus(summary, targetStatus, pendingRecords.length);
  const jobStatus = jobStatusForReviewSummary(summary);
  const updatedRecords = pendingRecords.map((record) => ({
    ...record,
    review_status: targetStatus,
    updated_at: now,
  }));

  await context.env.DB.batch([
    context.env.DB.prepare(
      `
        INSERT INTO import_review_decisions (
          id, import_job_id, action, reviewer_user_id, note, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).bind(decisionId, jobId, action, current.user.id, note, now),
    ...pendingRecords.flatMap((record) => {
      const recordDecisionId = crypto.randomUUID();
      return [
        context.env.DB.prepare(
          `
            INSERT INTO import_review_record_decisions (
              id, decision_id, import_job_id, staged_record_key, action, note, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(recordDecisionId, decisionId, jobId, record.staged_record_key, action, note, now),
        context.env.DB.prepare(
          `
            UPDATE example_staged_records
            SET review_status = ?, updated_at = ?
            WHERE id = ? AND review_status = 'pending'
          `,
        ).bind(targetStatus, now, record.id),
        prepareAuditInsert(
          context.env,
          createAuditEvent({
            action: `import_review.record_${targetStatus}`,
            actor: {
              id: current.user.id,
              kind: "user",
            },
            subject: {
              id: record.id,
              kind: "example_staged_record",
            },
            metadata: {
              importJobId: jobId,
              stagedRecordKey: record.staged_record_key,
              decisionId,
              recordDecisionId,
              batch: true,
            },
          }),
        ),
      ];
    }),
    context.env.DB.prepare(
      `
        UPDATE import_jobs
        SET status = ?, updated_at = ?
        WHERE id = ?
      `,
    ).bind(jobStatus, now, jobId),
    prepareImportJobEventInsert(context.env, {
      importJobId: jobId,
      sourceFileId: job.source_file_id,
      eventType: "import_review.records_approved",
      statusTo: jobStatus,
      actorUserId: current.user.id,
      message: "Pending staged records approved.",
      createdAt: now,
      metadata: {
        decisionId,
        confirmedCount: pendingRecords.length,
        stagedRecordKeys: pendingRecords.map((record) => record.staged_record_key),
        targetReviewStatus: targetStatus,
      },
    }),
  ]);

  return context.json({
    importJobId: jobId,
    status: jobStatus,
    confirmedCount: pendingRecords.length,
    records: updatedRecords.map(publicExampleStagedRecord),
  });
}

async function recordReviewDecisionResponse(
  context: AppContext,
  action: ReviewRecordDecisionAction,
): Promise<Response> {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "review:decide");
  if (denied) return denied;

  const input = await parseRequestJson(context, ReviewDecisionInputSchema);
  if (!input.ok) return input.response;

  const jobId = context.req.param("jobId");
  const recordId = context.req.param("recordId");
  if (!jobId || !recordId) {
    return authError(context, "staged_record_not_found", "Staged record was not found.", 404);
  }

  const record = await context.env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        source_file_id,
        staged_record_key,
        source_row_key,
        payload_json,
        review_status,
        committed_record_id,
        created_at,
        updated_at
      FROM example_staged_records
      WHERE id = ? AND import_job_id = ?
      LIMIT 1
    `,
  )
    .bind(recordId, jobId)
    .first<ExampleStagedRecordRow>();

  if (!record) {
    return authError(context, "staged_record_not_found", "Staged record was not found.", 404);
  }

  if (record.review_status === "committed") {
    return authError(
      context,
      "staged_record_committed",
      "Committed records cannot be reviewed again.",
      409,
    );
  }

  const targetStatus = stagedStatusForReviewAction(action);
  if (record.review_status === targetStatus) {
    return context.json({
      record: publicExampleStagedRecord(record),
      duplicate: true,
    });
  }

  const now = new Date().toISOString();
  const decisionId = crypto.randomUUID();
  const recordDecisionId = crypto.randomUUID();
  const note = input.value.note ?? null;
  const jobStatus = await readImportJobStatusAfterRecordDecision(context.env, {
    importJobId: jobId,
    currentStatus: record.review_status,
    targetStatus,
  });

  await context.env.DB.batch([
    context.env.DB.prepare(
      `
        INSERT INTO import_review_decisions (
          id, import_job_id, action, reviewer_user_id, note, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).bind(decisionId, jobId, action, current.user.id, note, now),
    context.env.DB.prepare(
      `
        INSERT INTO import_review_record_decisions (
          id, decision_id, import_job_id, staged_record_key, action, note, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(recordDecisionId, decisionId, jobId, record.staged_record_key, action, note, now),
    context.env.DB.prepare(
      `
        UPDATE example_staged_records
        SET review_status = ?, updated_at = ?
        WHERE id = ?
      `,
    ).bind(targetStatus, now, record.id),
    context.env.DB.prepare(
      `
        UPDATE import_jobs
        SET status = ?, updated_at = ?
        WHERE id = ?
      `,
    ).bind(jobStatus, now, jobId),
    prepareImportJobEventInsert(context.env, {
      importJobId: jobId,
      sourceFileId: record.source_file_id,
      eventType: `import_review.record_${targetStatus}`,
      statusFrom: record.review_status,
      statusTo: jobStatus,
      actorUserId: current.user.id,
      message: `Staged record ${targetStatus}.`,
      createdAt: now,
      metadata: {
        stagedRecordKey: record.staged_record_key,
        decisionId,
        recordDecisionId,
        targetReviewStatus: targetStatus,
      },
    }),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: `import_review.record_${targetStatus}`,
        actor: {
          id: current.user.id,
          kind: "user",
        },
        subject: {
          id: record.id,
          kind: "example_staged_record",
        },
        metadata: {
          importJobId: jobId,
          stagedRecordKey: record.staged_record_key,
          decisionId,
        },
      }),
    ),
  ]);

  return context.json({
    record: publicExampleStagedRecord({
      ...record,
      review_status: targetStatus,
      updated_at: now,
    }),
  });
}

export async function readImportJobReview(
  env: Env,
  jobId: string,
): Promise<ImportJobReviewRow | null> {
  return env.DB.prepare(
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
    .bind(jobId)
    .first<ImportJobReviewRow>();
}

async function readImportJobStatusAfterRecordDecision(
  env: Env,
  input: {
    importJobId: string;
    currentStatus: string;
    targetStatus: Extract<StagedRecordStatus, "approved" | "rejected">;
  },
): Promise<ImportJobStatus> {
  const summary = await readReviewStatusSummary(env, input.importJobId);
  adjustReviewStatus(summary, input.currentStatus, -1);
  adjustReviewStatus(summary, input.targetStatus, 1);

  return jobStatusForReviewSummary(summary);
}

async function readImportJobStatusAfterCommit(
  env: Env,
  importJobId: string,
  committedCount: number,
): Promise<ImportJobStatus> {
  const summary = await readReviewStatusSummary(env, importJobId);
  summary.approved = Math.max(0, summary.approved - committedCount);
  summary.committed += committedCount;

  return jobStatusForReviewSummary(summary);
}

async function readReviewStatusSummary(
  env: Env,
  importJobId: string,
): Promise<ReviewStatusSummary> {
  const rows = await env.DB.prepare(
    `
      SELECT review_status, COUNT(*) AS count
      FROM example_staged_records
      WHERE import_job_id = ?
      GROUP BY review_status
    `,
  )
    .bind(importJobId)
    .all<ReviewStatusCountRow>();
  const summary: ReviewStatusSummary = {
    pending: 0,
    approved: 0,
    rejected: 0,
    committed: 0,
  };

  for (const row of rows.results) {
    adjustReviewStatus(summary, row.review_status, row.count);
  }

  return summary;
}

function adjustReviewStatus(summary: ReviewStatusSummary, status: string, delta: number): void {
  if (isReviewStatus(status)) {
    summary[status] = Math.max(0, summary[status] + delta);
  }
}

function isReviewStatus(status: string): status is keyof ReviewStatusSummary {
  return (
    status === "pending" || status === "approved" || status === "rejected" || status === "committed"
  );
}

function publicImportJobReview(row: ImportJobReviewRow): Record<string, unknown> {
  return {
    id: row.id,
    sourceFileId: row.source_file_id,
    status: row.status,
    jobKind: row.job_kind,
    adapterId: row.adapter_id,
    failureReason: row.failure_reason,
    failureClass: row.failure_class,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    sourceFile: {
      filename: row.filename,
      contentType: row.content_type,
      objectKey: row.object_key,
    },
  };
}

function publicExampleStagedRecord(row: ExampleStagedRecordRow): Record<string, unknown> {
  return {
    id: row.id,
    importJobId: row.import_job_id,
    sourceFileId: row.source_file_id,
    stagedRecordKey: row.staged_record_key,
    sourceRowKey: row.source_row_key,
    payload: parseJsonValue(row.payload_json),
    reviewStatus: row.review_status,
    committedRecordId: row.committed_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicExampleCommittedRecord(row: ExampleCommittedRecordRow): Record<string, unknown> {
  return {
    id: row.id,
    importJobId: row.import_job_id,
    sourceFileId: row.source_file_id,
    stagedRecordKey: row.staged_record_key,
    payload: parseJsonValue(row.payload_json),
    committedBy: row.committed_by,
    committedAt: row.committed_at,
  };
}

function publicImportReviewIssue(row: ImportReviewIssueRow): Record<string, string> {
  return {
    id: row.id,
    importJobId: row.import_job_id,
    stagedRecordKey: row.staged_record_key,
    code: row.code,
    message: row.message,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at,
  };
}

function parseJsonValue(value: string): unknown {
  return JSON.parse(value);
}

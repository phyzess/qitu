import { createAuditEvent } from "@qitu/audit";
import {
  jobStatusAfterRecordDecision,
  stagedStatusForReviewAction,
  type CommitApprovedContext,
  type ReviewRecordDecisionAction,
} from "@qitu/import-pipeline";
import type { Hono } from "hono";
import * as v from "valibot";
import { prepareAuditInsert } from "./audit-store";
import { readCurrentUser, requirePermission } from "./auth-routes";
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
          status: "committed",
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
          SET status = 'committed', completed_at = ?, updated_at = ?
          WHERE id = ?
        `,
      ).bind(now, now, jobId),
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
      status: "committed",
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
  const jobStatus = jobStatusAfterRecordDecision(action);

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

import { createAuditEvent } from "@qitu/audit";
import { createManualReviewIssue } from "@qitu/import-pipeline";
import type { Hono } from "hono";
import * as v from "valibot";
import { prepareAuditInsert } from "./audit-store";
import { authError, parseRequestJson, type AppContext } from "./http-utils";
import { prepareImportJobEventInsert } from "./import-job-event-store";
import { prepareImportJobWriteGuardAssertion } from "./import-job-write-guard";
import { readReviewDecisionTarget } from "./import-review-decision-target";
import {
  claimImportReviewMutation,
  releaseImportReviewMutation,
} from "./import-review-mutation-claim";
import { publicStagedRecord } from "./import-review-presenters";
import { readImportJobStatusAfterRecordDecision } from "./import-review-status";

const AdjustStagedRecordInputSchema = v.object({
  payload: v.unknown(),
  note: v.optional(v.string()),
});

export function registerImportReviewAdjustmentRoute(app: Hono<{ Bindings: Env }>): void {
  app.patch("/api/import-jobs/:jobId/staged-records/:recordId", async (context) =>
    adjustStagedRecordResponse(context),
  );
}

async function adjustStagedRecordResponse(context: AppContext): Promise<Response> {
  const input = await parseRequestJson(context, AdjustStagedRecordInputSchema);
  if (!input.ok) return input.response;

  const initialTarget = await readReviewDecisionTarget(context);
  if (!initialTarget.ok) return initialTarget.response;
  if (
    !initialTarget.adapter.adjustStagedRecord ||
    !initialTarget.adapter.reviewStore.prepareAdjustStagedRecord
  ) {
    return adjustmentNotSupported(context);
  }

  const claim = await claimImportReviewMutation(context.env, {
    expectedStatus: initialTarget.job.status,
    importJobId: initialTarget.jobId,
    kind: "adjust_record",
    processingStartedAt: initialTarget.job.processing_started_at,
  });
  if (!claim) {
    return authError(
      context,
      "import_review_mutation_in_progress",
      "Another review change is in progress; reload and retry.",
      409,
    );
  }

  let currentStatus = claim.status;
  try {
    const target = await readReviewDecisionTarget(context);
    if (!target.ok) return target.response;
    const { adapter, current, job, jobId, record } = target;
    if (!adapter.adjustStagedRecord || !adapter.reviewStore.prepareAdjustStagedRecord) {
      return adjustmentNotSupported(context);
    }

    let adjusted: Awaited<ReturnType<NonNullable<typeof adapter.adjustStagedRecord>>>;
    try {
      adjusted = await adapter.adjustStagedRecord(input.value.payload);
    } catch (error) {
      return authError(
        context,
        "invalid_staged_record_adjustment",
        error instanceof Error ? error.message : "Adjusted payload is invalid.",
        422,
      );
    }

    const adjustedAt = new Date().toISOString();
    const adjustedPayloadJson = JSON.stringify(adjusted.payload);
    const [previousPayloadHash, adjustedPayloadHash] = await Promise.all([
      sha256Text(record.payload_json),
      sha256Text(adjustedPayloadJson),
    ]);
    const issues = [createManualReviewIssue(), ...adjusted.issues];
    const jobStatus = await readImportJobStatusAfterRecordDecision(context.env, {
      importJobId: jobId,
      reviewStore: adapter.reviewStore,
      currentStatus: record.review_status,
      targetStatus: "pending",
    });
    const writeGuard = {
      importJobId: jobId,
      mutationToken: claim.token,
      processingStartedAt: job.processing_started_at,
      status: job.status,
    };

    await context.env.DB.batch([
      prepareImportJobWriteGuardAssertion(context.env, writeGuard),
      adapter.reviewStore.prepareAdjustStagedRecord(context.env, {
        id: record.id,
        payloadJson: adjustedPayloadJson,
        reviewStatus: "pending",
        updatedAt: adjustedAt,
      }),
      context.env.DB.prepare(
        `
          UPDATE import_review_issues
          SET status = 'superseded'
          WHERE import_job_id = ? AND staged_record_key = ? AND status = 'open'
        `,
      ).bind(jobId, record.staged_record_key),
      ...issues.map((issue) =>
        context.env.DB.prepare(
          `
            INSERT INTO import_review_issues (
              id, import_job_id, staged_record_key, code, message, severity, status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
            ON CONFLICT(import_job_id, staged_record_key, code) DO UPDATE SET
              message = excluded.message,
              severity = excluded.severity,
              status = 'open',
              created_at = excluded.created_at
          `,
        ).bind(
          crypto.randomUUID(),
          jobId,
          record.staged_record_key,
          issue.code,
          issue.message,
          issue.severity,
          adjustedAt,
        ),
      ),
      context.env.DB.prepare("UPDATE import_jobs SET status = ?, updated_at = ? WHERE id = ?").bind(
        jobStatus,
        adjustedAt,
        jobId,
      ),
      prepareImportJobEventInsert(context.env, {
        importJobId: jobId,
        sourceFileId: record.source_file_id,
        eventType: "import_review.record_adjusted",
        statusFrom: record.review_status,
        statusTo: jobStatus,
        actorUserId: current.user.id,
        message: "Staged record adjusted and returned to pending confirmation.",
        createdAt: adjustedAt,
        metadata: {
          stagedRecordKey: record.staged_record_key,
          issueCodes: issues.map((issue) => issue.code),
          note: input.value.note ?? null,
          previousPayloadHash,
          adjustedPayloadHash,
        },
      }),
      prepareAuditInsert(
        context.env,
        createAuditEvent({
          action: "import_review.record_adjusted",
          actor: {
            id: current.user.id,
            kind: "user",
          },
          subject: {
            id: record.id,
            kind: adapter.reviewStore.stagedRecordSubjectKind,
          },
          metadata: {
            importJobId: jobId,
            stagedRecordKey: record.staged_record_key,
            previousReviewStatus: record.review_status,
            issueCodes: issues.map((issue) => issue.code),
            note: input.value.note ?? null,
            previousPayloadHash,
            adjustedPayloadHash,
          },
        }),
      ),
    ]);
    currentStatus = jobStatus;

    return context.json({
      record: publicStagedRecord({
        ...record,
        payload_json: adjustedPayloadJson,
        review_status: "pending",
        updated_at: adjustedAt,
      }),
    });
  } finally {
    await releaseImportReviewMutation(context.env, {
      claim,
      currentStatus,
      importJobId: initialTarget.jobId,
      status: currentStatus,
    });
  }
}

function adjustmentNotSupported(context: AppContext): Response {
  return authError(
    context,
    "staged_record_adjustment_not_supported",
    "The app-owned adapter does not support staged-record adjustment.",
    409,
  );
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

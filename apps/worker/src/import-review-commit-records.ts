import type { CommitApprovedContext } from "@qitu/import-pipeline";
import type { WorkerImportAdapter } from "./import-adapters";
import {
  buildCommittedRecordPairs,
  prepareImportReviewCommitStatements,
} from "./import-review-commit-persistence";
import { readImportJobReview } from "./import-review-job-read";
import { readOpenErrorReviewIssues } from "./import-review-issue-queries";
import { parseJsonValue } from "./import-review-presenters";
import type { ImportJobReviewRow } from "./import-review-row-types";
import { readImportJobStatusAfterCommit } from "./import-review-status";
import type { StoredCommittedRecordRow, StoredStagedRecordRow } from "./import-review-store";
import { importJobMatchesWriteGuard, type ImportJobWriteGuard } from "./import-job-write-guard";

type CommitApprovedRecordsResult =
  | {
      ok: true;
      committedAt: string;
      committedRecords: StoredCommittedRecordRow[];
      status: string;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        status: 409;
      };
    };

export async function commitApprovedRecords(input: {
  actorKind?: "system" | "user";
  actorUserId: string;
  adapter: WorkerImportAdapter;
  approvedRecords: StoredStagedRecordRow[];
  automatic?: boolean;
  env: Env;
  job: ImportJobReviewRow;
  jobId: string;
  requestedByUserId?: string;
  writeGuard?: ImportJobWriteGuard;
}): Promise<CommitApprovedRecordsResult> {
  const {
    actorKind = "user",
    actorUserId,
    adapter,
    approvedRecords,
    automatic = false,
    env,
    job,
    jobId,
    requestedByUserId,
    writeGuard,
  } = input;
  const committedAt = new Date().toISOString();
  const commitContext: CommitApprovedContext = {
    importJobId: jobId,
    reviewerId: actorUserId,
    approvedStagedRecordKeys: approvedRecords.map((record) => record.staged_record_key),
    idempotencyKey: `commit:${jobId}`,
  };

  const [reservedJob, reservedApprovedRecords, reservedOpenErrors, writeReservationMatches] =
    await Promise.all([
      readImportJobReview(env, jobId),
      adapter.reviewStore.readApprovedStagedRecords(env, jobId),
      readOpenErrorReviewIssues(env, {
        jobId,
        stagedRecordKeys: approvedRecords.map((record) => record.staged_record_key),
      }),
      writeGuard ? importJobMatchesWriteGuard(env, writeGuard) : Promise.resolve(true),
    ]);
  if (
    !reservedJob ||
    reservedJob.status === "voided" ||
    reservedJob.deletion_started_at ||
    reservedJob.deleted_at ||
    !writeReservationMatches ||
    reservedOpenErrors.length > 0 ||
    !sameApprovedRecordSnapshot(approvedRecords, reservedApprovedRecords)
  ) {
    return reviewStateChangedResult();
  }

  const committedPayloads = await adapter.commitApproved(
    approvedRecords.map((record) => parseJsonValue(record.payload_json)),
    commitContext,
  );

  if (committedPayloads.length !== approvedRecords.length) {
    return {
      ok: false,
      error: {
        code: "commit_result_mismatch",
        message: "Import adapter returned a mismatched number of committed records.",
        status: 409,
      },
    };
  }

  const [currentJob, currentApprovedRecords, openErrors, currentGuardMatches] = await Promise.all([
    readImportJobReview(env, jobId),
    adapter.reviewStore.readApprovedStagedRecords(env, jobId),
    readOpenErrorReviewIssues(env, {
      jobId,
      stagedRecordKeys: approvedRecords.map((record) => record.staged_record_key),
    }),
    writeGuard ? importJobMatchesWriteGuard(env, writeGuard) : Promise.resolve(true),
  ]);
  if (
    !currentJob ||
    currentJob.status === "voided" ||
    currentJob.deletion_started_at ||
    currentJob.deleted_at ||
    !currentGuardMatches ||
    openErrors.length > 0 ||
    !sameApprovedRecordSnapshot(approvedRecords, currentApprovedRecords)
  ) {
    return reviewStateChangedResult();
  }

  const committedRecordPairs = buildCommittedRecordPairs({
    approvedRecords,
    committedAt,
    committedBy: actorUserId,
    committedPayloads,
  });
  const committedRecords = committedRecordPairs.map(({ committedRecord }) => committedRecord);
  const jobStatusAfterCommit = await readImportJobStatusAfterCommit(
    env,
    adapter.reviewStore,
    jobId,
    committedRecords.length,
  );

  await env.DB.batch(
    prepareImportReviewCommitStatements(env, {
      adapter,
      actorKind,
      automatic,
      committedAt,
      committedRecordPairs,
      currentUserId: actorUserId,
      job,
      jobId,
      jobStatusAfterCommit,
      ...(requestedByUserId ? { requestedByUserId } : {}),
      ...(writeGuard ? { writeGuard } : {}),
    }),
  );

  if (
    writeGuard &&
    !(await importJobMatchesWriteGuard(env, {
      importJobId: writeGuard.importJobId,
      processingStartedAt: writeGuard.processingStartedAt,
      status: jobStatusAfterCommit,
    }))
  ) {
    return reviewStateChangedResult();
  }

  return {
    ok: true,
    committedAt,
    committedRecords,
    status: jobStatusAfterCommit,
  };
}

function reviewStateChangedResult(): CommitApprovedRecordsResult {
  return {
    ok: false,
    error: {
      code: "review_state_changed",
      message: "Review state changed while preparing the commit; reload and review again.",
      status: 409,
    },
  };
}

function sameApprovedRecordSnapshot(
  expected: StoredStagedRecordRow[],
  current: StoredStagedRecordRow[],
): boolean {
  if (expected.length !== current.length) return false;

  const currentById = new Map(current.map((record) => [record.id, record]));
  return expected.every((record) => {
    const latest = currentById.get(record.id);
    return (
      latest?.review_status === "approved" &&
      latest.updated_at === record.updated_at &&
      latest.payload_json === record.payload_json
    );
  });
}

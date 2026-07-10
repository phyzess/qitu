import {
  createManualReviewIssue,
  type ReviewIssue,
  sourceRowKeyForIndex,
  stagedRecordKeyForSourceRow,
} from "@qitu/import-pipeline";
import type { WorkerImportAdapter } from "./import-adapters";
import { autoCommitCleanImport, isAutoCommitEnabled } from "./import-job-auto-commit";
import { prepareImportJobStagingStatements } from "./import-job-staging-persistence";
import { importJobMatchesWriteGuard, type ImportJobWriteGuard } from "./import-job-write-guard";

export async function stageImportJobRecords(
  env: Env,
  input: {
    adapter: WorkerImportAdapter;
    importJobId: string;
    objectKey: string;
    processingStartedAt: string;
    processingOwner: string;
    sourceFileId: string;
    stagedAt: string;
    stagedRecords: Array<{
      issues: ReviewIssue[];
      payload: unknown;
    }>;
  },
): Promise<boolean> {
  const processingGuard: ImportJobWriteGuard = {
    importJobId: input.importJobId,
    processingOwner: input.processingOwner,
    processingStartedAt: input.processingStartedAt,
    status: "processing",
  };
  const stagedRows = await Promise.all(
    input.stagedRecords.map(async (record, index) => {
      const rowIndex = index + 1;
      const stagedRecordKey = stagedRecordKeyForSourceRow({
        sourceFileId: input.sourceFileId,
        rowIndex,
      });
      const existingStagedRecord = await input.adapter.reviewStore.readStagedRecordByKey(env, {
        importJobId: input.importJobId,
        stagedRecordKey,
      });

      return {
        id: existingStagedRecord?.id ?? crypto.randomUUID(),
        stagedRecordKey,
        sourceRowKey: sourceRowKeyForIndex(rowIndex),
        payloadJson: JSON.stringify(record.payload),
        issues: [
          ...(isAutoCommitEnabled(input.adapter) ? [] : [createManualReviewIssue()]),
          ...record.issues,
        ],
      };
    }),
  );

  await env.DB.batch(
    prepareImportJobStagingStatements(env, {
      adapter: input.adapter,
      importJobId: input.importJobId,
      objectKey: input.objectKey,
      sourceFileId: input.sourceFileId,
      stagedAt: input.stagedAt,
      stagedRows,
      writeGuard: processingGuard,
    }),
  );

  const needsReviewGuard: ImportJobWriteGuard = {
    importJobId: processingGuard.importJobId,
    processingStartedAt: processingGuard.processingStartedAt,
    status: "needs_review",
  };
  if (!(await importJobMatchesWriteGuard(env, needsReviewGuard))) {
    return false;
  }

  await autoCommitCleanImport(env, {
    adapter: input.adapter,
    importJobId: input.importJobId,
    processingStartedAt: input.processingStartedAt,
  });

  return true;
}

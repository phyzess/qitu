import * as v from "valibot";

export const ImportJobStatusSchema = v.picklist([
  "queued",
  "processing",
  "needs_review",
  "approved",
  "committed",
  "failed",
  "voided",
]);

export type ImportJobStatus = v.InferOutput<typeof ImportJobStatusSchema>;

export const ImportFailureClassSchema = v.picklist([
  "adapter_missing",
  "commit_conflict",
  "duplicate_source",
  "duplicate_target",
  "infrastructure",
  "parse",
  "processing",
  "queue_dispatch",
  "source_missing",
  "unsupported_source",
  "validation",
]);

export const ReviewIssueSeveritySchema = v.picklist(["info", "warning", "error"]);
export const ReviewRecordDecisionActionSchema = v.picklist(["approve", "reject"]);
export const ReviewDecisionActionSchema = v.picklist(["approve", "reject", "void"]);
export const ConfirmationRecordDecisionActionSchema = v.picklist(["confirm", "exclude"]);
export const StagedRecordStatusSchema = v.picklist([
  "pending",
  "approved",
  "rejected",
  "committed",
]);

export type ImportFailureClass = v.InferOutput<typeof ImportFailureClassSchema>;
export type ReviewIssueSeverity = v.InferOutput<typeof ReviewIssueSeveritySchema>;
export type ReviewRecordDecisionAction = v.InferOutput<typeof ReviewRecordDecisionActionSchema>;
export type ReviewDecisionAction = v.InferOutput<typeof ReviewDecisionActionSchema>;
export type ConfirmationRecordDecisionAction = v.InferOutput<
  typeof ConfirmationRecordDecisionActionSchema
>;
export type StagedRecordStatus = v.InferOutput<typeof StagedRecordStatusSchema>;
export type ConfirmationRecordStatus = "pending" | "confirmed" | "excluded" | "committed";

export type ImportJob = {
  id: string;
  sourceFileId: string;
  status: ImportJobStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type StagedRecord<TPayload> = {
  id: string;
  importJobId: string;
  stagedRecordKey: string;
  status: StagedRecordStatus;
  payload: TPayload;
  issues: ReviewIssue[];
};

export type ReviewIssue = {
  code: string;
  message: string;
  severity: ReviewIssueSeverity;
};

export type CommitApprovedContext = {
  importJobId: string;
  reviewerId: string;
  approvedStagedRecordKeys: string[];
  idempotencyKey: string;
};

export type ImportFeatureAdapter<TParsed, TStaged, TCommitted> = {
  id: string;
  canHandle(source: { filename: string; contentType: string }): boolean;
  parse(source: ReadableStream<Uint8Array>): Promise<TParsed[]>;
  stage(parsed: TParsed[]): Promise<TStaged[]>;
  validate(staged: TStaged): ReviewIssue[];
  commitApproved(input: {
    records: TStaged[];
    context: CommitApprovedContext;
  }): Promise<TCommitted[]>;
};

export type ReviewDecision = {
  importJobId: string;
  reviewerId: string;
  action: ReviewDecisionAction;
  note?: string;
  rowDecisions?: Array<{
    stagedRecordId: string;
    action: ReviewRecordDecisionAction;
    note?: string;
  }>;
};

export type ReviewStatusSummary = Record<StagedRecordStatus, number>;

export function createManualReviewIssue(): ReviewIssue {
  return {
    code: "manual_review_required",
    message: "Record was staged and requires human confirmation before commit.",
    severity: "info",
  };
}

export function stagedRecordKeyForSourceRow(input: {
  sourceFileId: string;
  rowIndex: number;
}): string {
  assertPositiveRowIndex(input.rowIndex);
  return `source-file:${input.sourceFileId}:row:${input.rowIndex}`;
}

export function sourceRowKeyForIndex(rowIndex: number): string {
  assertPositiveRowIndex(rowIndex);
  return `row:${rowIndex}`;
}

export function stagedStatusForReviewAction(
  action: ReviewRecordDecisionAction,
): Extract<StagedRecordStatus, "approved" | "rejected"> {
  return action === "approve" ? "approved" : "rejected";
}

export function reviewActionForConfirmationAction(
  action: ConfirmationRecordDecisionAction,
): ReviewRecordDecisionAction {
  return action === "confirm" ? "approve" : "reject";
}

export function confirmationActionForReviewAction(
  action: ReviewRecordDecisionAction,
): ConfirmationRecordDecisionAction {
  return action === "approve" ? "confirm" : "exclude";
}

export function stagedStatusForConfirmationAction(
  action: ConfirmationRecordDecisionAction,
): Extract<StagedRecordStatus, "approved" | "rejected"> {
  return stagedStatusForReviewAction(reviewActionForConfirmationAction(action));
}

export function confirmationStatusForStagedStatus(
  status: StagedRecordStatus,
): ConfirmationRecordStatus {
  if (status === "approved") return "confirmed";
  if (status === "rejected") return "excluded";
  return status;
}

export function summarizeReviewStatuses(statuses: Iterable<string>): ReviewStatusSummary {
  const summary: ReviewStatusSummary = {
    pending: 0,
    approved: 0,
    rejected: 0,
    committed: 0,
  };

  for (const status of statuses) {
    const result = v.safeParse(StagedRecordStatusSchema, status);
    if (result.success) {
      summary[result.output] += 1;
    }
  }

  return summary;
}

export function jobStatusForReviewSummary(
  summary: Pick<ReviewStatusSummary, "pending" | "approved" | "committed">,
): ImportJobStatus {
  if (summary.approved > 0) {
    return "approved";
  }

  if (summary.pending > 0) {
    return "needs_review";
  }

  if (summary.committed > 0) {
    return "committed";
  }

  return "needs_review";
}

function assertPositiveRowIndex(rowIndex: number): void {
  if (!Number.isInteger(rowIndex) || rowIndex < 1) {
    throw new Error("Row index must be a positive integer.");
  }
}

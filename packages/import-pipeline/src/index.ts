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

export const ReviewIssueSeveritySchema = v.picklist(["info", "warning", "error"]);
export const ReviewRecordDecisionActionSchema = v.picklist(["approve", "reject"]);

export type ReviewIssueSeverity = v.InferOutput<typeof ReviewIssueSeveritySchema>;
export type ReviewRecordDecisionAction = v.InferOutput<typeof ReviewRecordDecisionActionSchema>;

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
  status: "pending" | "approved" | "rejected" | "committed";
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

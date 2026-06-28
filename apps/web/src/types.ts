export type ApiUser = {
  id: string;
  email: string;
  role: string;
  displayName?: string;
  createdAt: string;
};

export type InvitationSummary = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  createdBy?: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
};

export type SourceFile = {
  id: string;
  workspaceId: string;
  objectKey: string;
  filename: string;
  contentType: string;
  contentHash: string | null;
  size: number | null;
  uploadedBy: string;
  uploadedAt: string;
};

export type ImportJobListItem = {
  id: string;
  sourceFileId: string;
  status: string;
  jobKind: string | null;
  adapterId: string | null;
  attemptCount: number;
  failureReason: string | null;
  failureClass: string | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sourceFile: {
    filename: string;
    contentType: string;
    workspaceId: string;
  };
};

export type ImportJobReview = {
  id: string;
  sourceFileId: string;
  status: string;
  jobKind: string | null;
  adapterId: string | null;
  failureReason: string | null;
  failureClass: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sourceFile: {
    filename: string;
    contentType: string;
    objectKey: string;
  };
};

export type ImportJobEvent = {
  id: string;
  importJobId: string;
  sourceFileId: string | null;
  eventType: string;
  statusFrom: string | null;
  statusTo: string | null;
  actorUserId: string | null;
  message: string | null;
  metadata: unknown;
  requestId: string | null;
  createdAt: string;
};

export type StagedRecord = {
  id: string;
  importJobId: string;
  sourceFileId: string;
  stagedRecordKey: string;
  sourceRowKey: string;
  payload: unknown;
  reviewStatus: string;
  committedRecordId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewIssue = {
  id: string;
  importJobId: string;
  stagedRecordKey: string;
  code: string;
  message: string;
  severity: string;
  status: string;
  createdAt: string;
};

export type AiAdvisoryArtifact = {
  id: string;
  kind: string;
  status: string;
  importJobId: string;
  provider: string;
  model: string;
  promptVersion: string;
  summary: string;
  output: unknown;
  createdAt: string;
  createdBy: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  dismissedBy: string | null;
  dismissedAt: string | null;
};

export type AuditEvent = {
  id: string;
  action: string;
  actor: {
    id: string;
    kind: string;
  };
  subject: {
    id: string;
    kind: string;
  };
  metadata: unknown;
  occurredAt: string;
};

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull(),
});

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  acceptedAt: text("accepted_at"),
  revokedAt: text("revoked_at"),
});

export const passwordCredentials = sqliteTable("password_credentials", {
  userId: text("user_id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    absoluteExpiresAt: text("absolute_expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const sourceFiles = sqliteTable("source_files", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  objectKey: text("object_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  contentHash: text("content_hash"),
  size: integer("size"),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
});

export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: text("id").primaryKey(),
    sourceFileId: text("source_file_id").notNull(),
    status: text("status").notNull(),
    jobKind: text("job_kind"),
    adapterId: text("adapter_id"),
    idempotencyKey: text("idempotency_key"),
    attemptCount: integer("attempt_count"),
    failureReason: text("failure_reason"),
    failureClass: text("failure_class"),
    processingStartedAt: text("processing_started_at"),
    completedAt: text("completed_at"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("import_jobs_idempotency_key_idx").on(table.idempotencyKey)],
);

export const importReviewIssues = sqliteTable(
  "import_review_issues",
  {
    id: text("id").primaryKey(),
    importJobId: text("import_job_id").notNull(),
    stagedRecordKey: text("staged_record_key").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("import_review_issues_job_idx").on(table.importJobId),
    index("import_review_issues_record_idx").on(table.importJobId, table.stagedRecordKey),
    uniqueIndex("import_review_issues_job_record_code_idx").on(
      table.importJobId,
      table.stagedRecordKey,
      table.code,
    ),
  ],
);

export const importReviewDecisions = sqliteTable(
  "import_review_decisions",
  {
    id: text("id").primaryKey(),
    importJobId: text("import_job_id").notNull(),
    action: text("action").notNull(),
    reviewerUserId: text("reviewer_user_id").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("import_review_decisions_job_idx").on(table.importJobId)],
);

export const importReviewRecordDecisions = sqliteTable(
  "import_review_record_decisions",
  {
    id: text("id").primaryKey(),
    decisionId: text("decision_id").notNull(),
    importJobId: text("import_job_id").notNull(),
    stagedRecordKey: text("staged_record_key").notNull(),
    action: text("action").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("import_review_record_decisions_job_idx").on(table.importJobId),
    index("import_review_record_decisions_record_idx").on(table.importJobId, table.stagedRecordKey),
  ],
);

export const aiAdvisoryArtifacts = sqliteTable(
  "ai_advisory_artifacts",
  {
    id: text("id").primaryKey(),
    importJobId: text("import_job_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    summary: text("summary").notNull(),
    outputJson: text("output_json").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    confirmedBy: text("confirmed_by"),
    confirmedAt: text("confirmed_at"),
    dismissedBy: text("dismissed_by"),
    dismissedAt: text("dismissed_at"),
  },
  (table) => [
    index("ai_advisory_artifacts_job_idx").on(table.importJobId, table.createdAt),
    index("ai_advisory_artifacts_status_idx").on(table.status),
  ],
);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  actorKind: text("actor_kind").notNull(),
  subjectId: text("subject_id").notNull(),
  subjectKind: text("subject_kind").notNull(),
  metadataJson: text("metadata_json"),
  occurredAt: text("occurred_at").notNull(),
});

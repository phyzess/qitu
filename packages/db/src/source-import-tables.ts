import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sourceFiles = sqliteTable(
  "source_files",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    contentHash: text("content_hash"),
    size: integer("size"),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: text("uploaded_at").notNull(),
    deletedAt: text("deleted_at"),
    deletedBy: text("deleted_by"),
    deletionStartedAt: text("deletion_started_at"),
    deletionStartedBy: text("deletion_started_by"),
    deletionFailureStage: text("deletion_failure_stage"),
    deletionFailureReason: text("deletion_failure_reason"),
  },
  (table) => [
    uniqueIndex("source_files_active_workspace_content_hash_idx")
      .on(table.workspaceId, table.contentHash)
      .where(sql`${table.deletedAt} IS NULL`),
    index("source_files_deleted_at_idx").on(table.deletedAt),
    index("source_files_deletion_started_at_idx").on(table.deletionStartedAt),
  ],
);

export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: text("id").primaryKey(),
    sourceFileId: text("source_file_id").notNull(),
    status: text("status").notNull(),
    jobKind: text("job_kind"),
    adapterId: text("adapter_id"),
    idempotencyKey: text("idempotency_key"),
    attemptCount: integer("attempt_count").default(0),
    failureReason: text("failure_reason"),
    failureClass: text("failure_class"),
    processingStartedAt: text("processing_started_at"),
    processingOwner: text("processing_owner"),
    processingLeaseExpiresAt: text("processing_lease_expires_at"),
    mutationToken: text("mutation_token"),
    mutationStartedAt: text("mutation_started_at"),
    mutationKind: text("mutation_kind"),
    mutationPreviousStatus: text("mutation_previous_status"),
    completedAt: text("completed_at"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("import_jobs_idempotency_key_idx").on(table.idempotencyKey),
    index("import_jobs_status_idx").on(table.status),
    index("import_jobs_mutation_started_at_idx").on(table.status, table.mutationStartedAt),
    index("import_jobs_processing_lease_idx").on(table.status, table.processingLeaseExpiresAt),
  ],
);

export const importJobEvents = sqliteTable(
  "import_job_events",
  {
    id: text("id").primaryKey(),
    importJobId: text("import_job_id").notNull(),
    sourceFileId: text("source_file_id"),
    eventType: text("event_type").notNull(),
    statusFrom: text("status_from"),
    statusTo: text("status_to"),
    actorUserId: text("actor_user_id"),
    message: text("message"),
    metadataJson: text("metadata_json"),
    requestId: text("request_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("import_job_events_job_created_idx").on(table.importJobId, table.createdAt),
    index("import_job_events_type_created_idx").on(table.eventType, table.createdAt),
  ],
);

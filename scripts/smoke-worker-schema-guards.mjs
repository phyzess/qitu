export function assertWorkerSchemaGuards(context) {
  const { assert, coreMigration } = context;

  assert(
    coreMigration.includes("password_credentials"),
    "core migration must include password credentials.",
  );
  assert(coreMigration.includes("token_hash"), "core migration must store token hashes.");
  assert(
    coreMigration.includes("password_reset_tokens") && coreMigration.includes("email_messages"),
    "auth email migration must include password reset tokens and email message metadata.",
  );
  assert(
    coreMigration.includes("inbound_email_messages") &&
      coreMigration.includes("inbound_email_attachments"),
    "inbound email migration must include receipt and attachment metadata tables.",
  );
  assert(
    coreMigration.includes("ALTER TABLE users ADD COLUMN role") &&
      coreMigration.includes("users_role_idx"),
    "user role migration must add users.role and its index.",
  );
  assert(
    coreMigration.includes("ai_advisory_artifacts") &&
      coreMigration.includes("ai_advisory_artifacts_job_idx") &&
      coreMigration.includes("ai_advisory_artifacts_status_idx"),
    "AI advisory migration must include advisory artifacts and query indexes.",
  );
  assert(
    coreMigration.includes("login_attempts") &&
      coreMigration.includes("import_job_events") &&
      coreMigration.includes("security_events") &&
      coreMigration.includes("alert_events"),
    "event foundation migration must include login attempts, import job events, security events, and alert events.",
  );
  assert(
    coreMigration.includes("content_hash"),
    "source file migration must include content_hash.",
  );
  assert(
    coreMigration.includes("deleted_at") &&
      coreMigration.includes("source_files_active_workspace_content_hash_idx") &&
      coreMigration.includes("WHERE deleted_at IS NULL"),
    "source lifecycle migration must tombstone deleted sources and scope hash uniqueness to active rows.",
  );
  assert(
    coreMigration.includes("deletion_started_at") &&
      coreMigration.includes("import_jobs_block_deleting_source") &&
      coreMigration.includes("source_deletion_in_progress"),
    "source deletion must claim the source and block new jobs while cleanup is in progress.",
  );
  assert(
    coreMigration.includes("failure_reason") && coreMigration.includes("processing_started_at"),
    "import job migration must include failure and processing state fields.",
  );
  assert(
    coreMigration.includes("processing_owner") &&
      coreMigration.includes("processing_lease_expires_at") &&
      coreMigration.includes("mutation_token") &&
      coreMigration.includes("mutation_previous_status") &&
      coreMigration.includes("import_jobs_processing_lease_idx") &&
      coreMigration.includes("import_jobs_mutation_started_at_idx"),
    "import job migration must expose business-neutral processing and mutation lease fields.",
  );
  assert(
    coreMigration.includes("adapter_id") &&
      coreMigration.includes("idempotency_key") &&
      coreMigration.includes("failure_class"),
    "import job migration must include adapter, idempotency, and structured failure fields.",
  );
  assert(
    coreMigration.includes("import_review_issues") &&
      coreMigration.includes("import_review_decisions") &&
      coreMigration.includes("import_review_record_decisions"),
    "review migration must include core review issue and decision tables.",
  );
  assert(
    coreMigration.includes("example_staged_records") &&
      coreMigration.includes("example_committed_records"),
    "review migration must include example-owned staging and commit tables.",
  );
}

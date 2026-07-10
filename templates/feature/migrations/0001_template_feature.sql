-- Copy this file into the app-owned Worker migrations folder before replacing the
-- starter import path. Rename tables and columns to the feature's business-owned
-- staging and commit model. Reusable qitu packages must not depend on these tables.

CREATE TABLE IF NOT EXISTS template_feature_staged_records (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL,
  staged_record_key TEXT NOT NULL,
  source_row_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  review_status TEXT NOT NULL,
  committed_record_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS template_feature_staged_records_job_key_idx
  ON template_feature_staged_records(import_job_id, staged_record_key);

CREATE INDEX IF NOT EXISTS template_feature_staged_records_job_idx
  ON template_feature_staged_records(import_job_id, review_status);

CREATE TABLE IF NOT EXISTS template_feature_committed_records (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL,
  staged_record_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  committed_by TEXT NOT NULL,
  committed_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS template_feature_committed_records_job_key_idx
  ON template_feature_committed_records(import_job_id, staged_record_key);

ALTER TABLE import_jobs ADD COLUMN mutation_token TEXT;
ALTER TABLE import_jobs ADD COLUMN mutation_started_at TEXT;
ALTER TABLE import_jobs ADD COLUMN mutation_kind TEXT;
ALTER TABLE import_jobs ADD COLUMN mutation_previous_status TEXT;
ALTER TABLE import_jobs ADD COLUMN processing_owner TEXT;
ALTER TABLE import_jobs ADD COLUMN processing_lease_expires_at TEXT;

CREATE INDEX IF NOT EXISTS import_jobs_mutation_started_at_idx
  ON import_jobs (status, mutation_started_at);

CREATE INDEX IF NOT EXISTS import_jobs_processing_lease_idx
  ON import_jobs (status, processing_lease_expires_at);

ALTER TABLE source_files ADD COLUMN deletion_started_at TEXT;
ALTER TABLE source_files ADD COLUMN deletion_started_by TEXT;
ALTER TABLE source_files ADD COLUMN deletion_failure_stage TEXT;
ALTER TABLE source_files ADD COLUMN deletion_failure_reason TEXT;

CREATE INDEX IF NOT EXISTS source_files_deletion_started_at_idx
  ON source_files (deletion_started_at);

CREATE TRIGGER IF NOT EXISTS import_jobs_block_deleting_source
BEFORE INSERT ON import_jobs
WHEN EXISTS (
  SELECT 1
  FROM source_files
  WHERE id = NEW.source_file_id
    AND (deletion_started_at IS NOT NULL OR deleted_at IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'source_deletion_in_progress');
END;

ALTER TABLE source_files ADD COLUMN deleted_at TEXT;
ALTER TABLE source_files ADD COLUMN deleted_by TEXT;

DROP INDEX IF EXISTS source_files_workspace_content_hash_idx;

CREATE UNIQUE INDEX IF NOT EXISTS source_files_active_workspace_content_hash_idx
  ON source_files (workspace_id, content_hash)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS source_files_deleted_at_idx
  ON source_files (deleted_at);

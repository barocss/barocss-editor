CREATE TABLE workspace_document_revisions (
  owner_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  title TEXT NOT NULL,
  page_id TEXT NOT NULL,
  snapshot_text TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, document_id, revision),
  UNIQUE (owner_id, request_id)
);

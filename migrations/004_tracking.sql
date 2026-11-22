CREATE TABLE IF NOT EXISTS tracking (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  opens INTEGER NOT NULL DEFAULT 0,
  auto_opens INTEGER NOT NULL DEFAULT 0,
  first_open_at INTEGER,
  last_open_at INTEGER,
  last_kind TEXT
);
CREATE INDEX IF NOT EXISTS tracking_message ON tracking (message_id);

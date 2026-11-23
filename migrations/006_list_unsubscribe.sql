CREATE TABLE IF NOT EXISTS list_unsubscribe (
  message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  http_url TEXT,
  mailto TEXT,
  one_click INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER
);

ALTER TABLE messages ADD COLUMN trashed_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_messages_trashed ON messages(trashed_at) WHERE folder = 'trash';

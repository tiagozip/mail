CREATE TABLE IF NOT EXISTS address_members (
  address TEXT NOT NULL REFERENCES addresses(address) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (address, user_id)
);
CREATE INDEX IF NOT EXISTS idx_address_members_user ON address_members(user_id);

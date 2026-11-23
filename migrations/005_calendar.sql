CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  recurrence_id INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  tz TEXT,
  rrule TEXT,
  exdates TEXT NOT NULL DEFAULT '[]',
  color TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  organizer TEXT,
  organizer_name TEXT,
  attendees_json TEXT NOT NULL DEFAULT '[]',
  my_address TEXT,
  my_status TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  source_message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, uid, recurrence_id)
);
CREATE INDEX IF NOT EXISTS idx_events_range ON events(user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_events_message ON events(user_id, source_message_id);

CREATE TABLE IF NOT EXISTS finance_state (
  id TEXT PRIMARY KEY CHECK (id = 'owner'),
  revision INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_drafts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS idempotency (
  id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports_sent (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS web_codes(hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS web_sessions(hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS state_backups(revision INTEGER PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL);
-- Multi-user tables are additive. Existing singleton and its backups are retained.
CREATE TABLE IF NOT EXISTS user_finance_state (
 user_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_state_backups (
 user_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,revision)
);
CREATE TABLE IF NOT EXISTS user_idempotency (
 user_id TEXT NOT NULL, id TEXT NOT NULL, request_hash TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,id)
);
CREATE TABLE IF NOT EXISTS user_web_codes(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS user_web_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS user_reports_sent(user_id TEXT NOT NULL,id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS legacy_owner_migrations(user_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);

-- One-use invitations and invited membership, independent of financial state.
CREATE TABLE IF NOT EXISTS user_invites(hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,expires_at INTEGER NOT NULL,claimed_user TEXT UNIQUE);

CREATE TABLE IF NOT EXISTS user_day_checks(user_id TEXT NOT NULL,day TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,day,kind));

CREATE TABLE IF NOT EXISTS user_release_outbox(user_id TEXT NOT NULL,release_id TEXT NOT NULL,payload TEXT NOT NULL,queued_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,release_id));

-- Zoom / Microsoft Teams academy integrations — additive schema.
--
-- Matches the conventions already used by this database: primary keys are
-- application-generated TEXT UUIDs (no sequences) and timestamps are stored as
-- ISO-8601 TEXT.
--
-- `academy_integrations` already exists, so the changes to it are written to be
-- idempotent: only the columns this feature needs are added.

-- Connection lifecycle state used by the admin integrations screen.
ALTER TABLE academy_integrations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'connected';

-- A provider may legitimately return no refresh token and no scope, so these
-- must be nullable for a connection to be storable.
ALTER TABLE academy_integrations ALTER COLUMN refresh_token_enc DROP NOT NULL;
ALTER TABLE academy_integrations ALTER COLUMN scope DROP NOT NULL;
ALTER TABLE academy_integrations ALTER COLUMN token_expires_at DROP NOT NULL;

-- Single-use, short-lived CSRF tokens for the OAuth authorize round trip.
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL
);

-- Meetings created on a connected provider account, one row per live session.
CREATE TABLE IF NOT EXISTS live_sessions (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  academy_integration_id TEXT NOT NULL REFERENCES academy_integrations(id),
  provider TEXT NOT NULL,
  external_meeting_id TEXT,
  join_url TEXT,
  host_url TEXT,
  topic TEXT,
  start_time TEXT,
  duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS live_sessions_module_id_idx ON live_sessions (module_id);
CREATE INDEX IF NOT EXISTS live_sessions_academy_id_idx ON live_sessions (academy_id);

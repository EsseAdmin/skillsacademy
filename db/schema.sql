-- Zoom / Microsoft Teams academy integration — additive schema.
-- Safe to run against your existing Postgres (Netlify DB / Neon) database:
-- it only adds new tables, it does not touch your existing courses/modules/users tables.
--
-- NOTE: live_sessions.course_id / module_id are stored as plain integers here
-- with NO foreign key to your real courses/modules tables, because this
-- package doesn't know their actual schema (serial vs uuid primary keys,
-- exact table names, etc). Once you wire this in, replace those two columns'
-- types to match your real primary keys and add proper FK constraints.

CREATE TABLE IF NOT EXISTS academy_integrations (
  id SERIAL PRIMARY KEY,
  academy_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('zoom', 'teams')),
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error')),
  external_account_email TEXT,
  external_account_id TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_expires_at TIMESTAMPTZ,
  scope TEXT,
  connected_by_user_id INTEGER,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academy_id, provider)
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id SERIAL PRIMARY KEY,
  academy_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,   -- CHECK: match your real courses.id type
  module_id INTEGER NOT NULL,   -- CHECK: match your real modules.id type
  academy_integration_id INTEGER NOT NULL REFERENCES academy_integrations(id),
  provider TEXT NOT NULL CHECK (provider IN ('zoom', 'teams')),
  external_meeting_id TEXT,
  join_url TEXT,
  host_url TEXT,
  topic TEXT,
  start_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  academy_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- oauth_states rows are single-use and short-lived; optionally add a cron/cleanup
-- job to delete rows older than ~1 hour if this table grows unbounded.

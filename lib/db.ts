import { Pool } from "pg";
import { getConnectionString as getNetlifyConnectionString } from "@netlify/database";

// Netlify has no persistent disk, so the database lives in Postgres —
// specifically Netlify Database (a managed Postgres, powered by Neon) when
// deployed there. Locally (or on any other Postgres host) set DATABASE_URL
// instead; that always takes priority so local dev never depends on being
// logged into Netlify.
function resolveConnectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    // Throws outside a Netlify context (e.g. local dev without `netlify dev`
    // and without DATABASE_URL set) — caught below for a clearer error.
    return getNetlifyConnectionString();
  } catch {
    throw new Error(
      "No database connection string found. Set DATABASE_URL for local development " +
        "(e.g. postgres://user:pass@localhost:5432/skillsacademy_dev), or deploy on Netlify " +
        "with Netlify Database provisioned."
    );
  }
}

declare global {
  var __skillsacademy_pool__: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({ connectionString: resolveConnectionString(), max: 5 });
}

export const pool: Pool = globalThis.__skillsacademy_pool__ ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalThis.__skillsacademy_pool__ = pool;
}

/** Run a query and return all rows as plain objects. */
export async function queryAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

/** Run a query and return the first row, or undefined if there were none. */
export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  await ensureSchema();
  const result = await pool.query(sql, params);
  return (result.rows[0] as T) ?? undefined;
}

/** Run a statement (INSERT/UPDATE/DELETE) without needing the result rows. */
export async function exec(sql: string, params: unknown[] = []): Promise<void> {
  await ensureSchema();
  await pool.query(sql, params);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS super_admins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  secondary_color TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  font_heading TEXT NOT NULL,
  preview_style TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_pence INTEGER NOT NULL,
  trial_days INTEGER NOT NULL DEFAULT 14,
  max_learners INTEGER,
  max_instructors INTEGER,
  max_courses INTEGER,
  features_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS academies (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sector TEXT NOT NULL DEFAULT 'business',
  template_id TEXT NOT NULL REFERENCES templates(id),
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  subscription_status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at TEXT NOT NULL,
  logo_text TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 0,
  hero_headline TEXT NOT NULL DEFAULT '',
  hero_tagline TEXT NOT NULL DEFAULT '',
  about_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  academy_id TEXT REFERENCES academies(id),
  role TEXT NOT NULL, -- ACADEMY_ADMIN | INSTRUCTOR | LEARNER
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(academy_id, email)
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL REFERENCES academies(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  price_pence INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  cover_emoji TEXT NOT NULL DEFAULT '📘',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL REFERENCES academies(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL, -- TEXT | URL | FILE
  content_text TEXT,
  content_url TEXT,
  file_path TEXT,
  file_name TEXT,
  file_mime TEXT,
  file_size INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE(course_id, module_id)
);

CREATE TABLE IF NOT EXISTS course_instructors (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  instructor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL,
  UNIQUE(course_id, instructor_id)
);

CREATE TABLE IF NOT EXISTS module_instructors (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  instructor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL,
  UNIQUE(module_id, instructor_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL REFERENCES academies(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  learner_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active', -- active | completed
  payment_status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | paid | free
  progress_pct INTEGER NOT NULL DEFAULT 0,
  enrolled_at TEXT NOT NULL,
  UNIQUE(course_id, learner_id)
);

CREATE TABLE IF NOT EXISTS module_completions (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id),
  completed_at TEXT NOT NULL,
  UNIQUE(enrollment_id, module_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL REFERENCES academies(id),
  learner_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT REFERENCES courses(id),
  amount_pence INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'succeeded',
  provider TEXT NOT NULL DEFAULT 'simulated',
  card_last4 TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL REFERENCES academies(id),
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  amount_pence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------- Live classes (Zoom / Microsoft Teams) ----------
-- One OAuth connection per academy per provider. Tokens are encrypted at
-- rest (see src/lib/crypto.ts) before being stored here.
CREATE TABLE IF NOT EXISTS academy_integrations (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'zoom' | 'microsoft'
  external_account_id TEXT,
  external_account_email TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  token_expires_at TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  connected_by TEXT NOT NULL REFERENCES users(id),
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(academy_id, provider)
);

-- content_type on modules grows new values: LIVE_SESSION | QUIZ | SCORM
-- (alongside the existing TEXT | URL | FILE) — no DB-level CHECK constraint,
-- enforced in the application layer same as the original three.
ALTER TABLE modules ADD COLUMN IF NOT EXISTS live_provider TEXT; -- 'zoom' | 'microsoft'
ALTER TABLE modules ADD COLUMN IF NOT EXISTS live_meeting_id TEXT;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS live_join_url TEXT;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS live_start_url TEXT;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS live_start_time TEXT;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS live_duration_minutes INTEGER;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS live_password TEXT;

-- ---------- Quizzes / assessments ----------
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pass_threshold_pct INTEGER NOT NULL DEFAULT 70,
  time_limit_minutes INTEGER,
  max_attempts INTEGER,
  shuffle_questions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL, -- single_choice | multiple_choice | true_false | short_answer
  prompt TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  short_answer_accepted TEXT -- JSON array of accepted normalized answers (short_answer only)
);

CREATE TABLE IF NOT EXISTS quiz_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES users(id),
  enrollment_id TEXT REFERENCES enrollments(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  score_pct INTEGER,
  passed INTEGER NOT NULL DEFAULT 0,
  answers_json TEXT NOT NULL DEFAULT '{}'
);

-- ---------- SCORM packages ----------
CREATE TABLE IF NOT EXISTS scorm_packages (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  academy_id TEXT NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  version TEXT NOT NULL, -- '1.2' | '2004'
  title TEXT NOT NULL,
  launch_path TEXT NOT NULL, -- relative path to the launch file inside the extracted package
  storage_prefix TEXT NOT NULL, -- blob/local-disk key prefix the extracted package lives under
  manifest_identifier TEXT,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scorm_attempts (
  id TEXT PRIMARY KEY,
  scorm_package_id TEXT NOT NULL REFERENCES scorm_packages(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES users(id),
  enrollment_id TEXT REFERENCES enrollments(id) ON DELETE CASCADE,
  lesson_status TEXT, -- SCORM 1.2 cmi.core.lesson_status
  completion_status TEXT, -- SCORM 2004 cmi.completion_status
  success_status TEXT, -- SCORM 2004 cmi.success_status
  score_raw INTEGER,
  suspend_data TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(scorm_package_id, learner_id)
);

-- ---------- Certification ----------
ALTER TABLE courses ADD COLUMN IF NOT EXISTS certification_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES users(id),
  enrollment_id TEXT REFERENCES enrollments(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL UNIQUE,
  pdf_path TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  UNIQUE(course_id, learner_id)
);

-- ---------- SEO / marketing (tiered by subscription plan) ----------
ALTER TABLE courses ADD COLUMN IF NOT EXISTS seo_meta_title TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS seo_meta_description TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS seo_og_image_path TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS seo_schema_json TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS seo_social_copy_json TEXT; -- {facebook, linkedin, x}
ALTER TABLE courses ADD COLUMN IF NOT EXISTS seo_ad_snippet_json TEXT; -- {google:[...], meta:[...]}

-- ---------- Custom academy templates ----------
-- academy_id NULL = one of the built-in preset templates (available to every
-- academy); academy_id set = a custom template an academy admin created for
-- their own branding, visible only to that academy alongside the presets.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS academy_id TEXT REFERENCES academies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_templates_academy_id ON templates(academy_id);

-- ---------- Academy homepage content blocks ----------
-- Lets an academy admin build out their live public homepage beyond the
-- fixed hero/about/catalog sections — arbitrary text sections, images,
-- embedded videos, and dated news/announcement posts, shown in order
-- between the About section and the course catalog.
CREATE TABLE IF NOT EXISTS site_blocks (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL, -- 'TEXT' | 'IMAGE' | 'VIDEO' | 'NEWS'
  title TEXT NOT NULL,
  body_text TEXT,
  image_path TEXT,
  video_url TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_blocks_academy_id ON site_blocks(academy_id);

-- ---------- Custom domains ----------
-- Lets an academy admin point their own domain (e.g. academy.theircompany.com)
-- at their academy. custom_domain_verification_token is a random value the
-- admin proves control of the domain with (as a DNS TXT record) before we
-- start routing traffic for it; custom_domain_verified_at is set once that
-- check passes. A partial unique index (rather than a plain UNIQUE column
-- constraint) is used so multiple academies can each have NULL (no domain
-- set) without colliding.
ALTER TABLE academies ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE academies ADD COLUMN IF NOT EXISTS custom_domain_verification_token TEXT;
ALTER TABLE academies ADD COLUMN IF NOT EXISTS custom_domain_verified_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_academies_custom_domain ON academies(custom_domain) WHERE custom_domain IS NOT NULL;
`;

let schemaReady: Promise<void> | undefined;

/** Ensures the schema exists. Safe to call repeatedly — every statement is idempotent. */
export function ensureSchema(): Promise<void> {
  // node-postgres runs a plain (no-params) query string via the simple
  // query protocol, which supports multiple ;-separated statements in one
  // round trip — no need to split SCHEMA up manually.
  if (!schemaReady) schemaReady = pool.query(SCHEMA).then(() => undefined);
  return schemaReady;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

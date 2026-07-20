import { queryAll, queryOne, exec, newId, nowIso } from "./db";

// ---------- Types ----------
export type Role = "SUPER_ADMIN" | "ACADEMY_ADMIN" | "INSTRUCTOR" | "LEARNER";

export interface Template {
  id: string;
  key: string;
  name: string;
  description: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_heading: string;
  preview_style: string;
}

export interface SubscriptionPlan {
  id: string;
  key: string;
  name: string;
  price_pence: number;
  trial_days: number;
  max_learners: number | null;
  max_instructors: number | null;
  max_courses: number | null;
  features_json: string;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Academy {
  id: string;
  slug: string;
  name: string;
  sector: string;
  template_id: string;
  plan_id: string;
  subscription_status: string;
  trial_ends_at: string;
  logo_text: string;
  contact_email: string;
  is_deleted: number;
  is_published: number;
  hero_headline: string;
  hero_tagline: string;
  about_text: string;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  academy_id: string | null;
  role: Role;
  name: string;
  email: string;
  password_hash: string;
  is_active: number;
  created_at: string;
}

export interface Course {
  id: string;
  academy_id: string;
  created_by: string;
  title: string;
  description: string;
  category: string;
  price_pence: number;
  is_published: number;
  cover_emoji: string;
  created_at: string;
  updated_at: string;
}

export interface ModuleRow {
  id: string;
  academy_id: string;
  created_by: string;
  title: string;
  description: string;
  content_type: "TEXT" | "URL" | "FILE";
  content_text: string | null;
  content_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  academy_id: string;
  course_id: string;
  learner_id: string;
  status: string;
  payment_status: string;
  progress_pct: number;
  enrolled_at: string;
}

// ---------- Templates ----------
export const Templates = {
  async all(): Promise<Template[]> {
    return queryAll<Template>("SELECT * FROM templates ORDER BY name");
  },
  async byId(id: string): Promise<Template | undefined> {
    return queryOne<Template>("SELECT * FROM templates WHERE id = $1", [id]);
  },
};

// ---------- Subscription Plans ----------
export const Plans = {
  async all(activeOnly = false): Promise<SubscriptionPlan[]> {
    const sql = activeOnly
      ? "SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order"
      : "SELECT * FROM subscription_plans ORDER BY sort_order";
    return queryAll<SubscriptionPlan>(sql);
  },
  async byId(id: string): Promise<SubscriptionPlan | undefined> {
    return queryOne<SubscriptionPlan>("SELECT * FROM subscription_plans WHERE id = $1", [id]);
  },
  async byKey(key: string): Promise<SubscriptionPlan | undefined> {
    return queryOne<SubscriptionPlan>("SELECT * FROM subscription_plans WHERE key = $1", [key]);
  },
  async create(input: {
    key: string;
    name: string;
    price_pence: number;
    trial_days: number;
    max_learners: number | null;
    max_instructors: number | null;
    max_courses: number | null;
    features: string[];
    sort_order: number;
  }): Promise<SubscriptionPlan> {
    const id = newId();
    const now = nowIso();
    await exec(
      `INSERT INTO subscription_plans (id, key, name, price_pence, trial_days, max_learners, max_instructors, max_courses, features_json, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        input.key,
        input.name,
        input.price_pence,
        input.trial_days,
        input.max_learners,
        input.max_instructors,
        input.max_courses,
        JSON.stringify(input.features),
        input.sort_order,
        now,
        now,
      ]
    );
    return (await Plans.byId(id))!;
  },
  async update(
    id: string,
    patch: Partial<{
      name: string;
      price_pence: number;
      trial_days: number;
      max_learners: number | null;
      max_instructors: number | null;
      max_courses: number | null;
      features: string[];
      is_active: boolean;
      sort_order: number;
    }>
  ): Promise<SubscriptionPlan | undefined> {
    const current = await Plans.byId(id);
    if (!current) return undefined;
    const name = patch.name ?? current.name;
    const price_pence = patch.price_pence ?? current.price_pence;
    const trial_days = patch.trial_days ?? current.trial_days;
    const max_learners = patch.max_learners !== undefined ? patch.max_learners : current.max_learners;
    const max_instructors =
      patch.max_instructors !== undefined ? patch.max_instructors : current.max_instructors;
    const max_courses = patch.max_courses !== undefined ? patch.max_courses : current.max_courses;
    const features_json = patch.features ? JSON.stringify(patch.features) : current.features_json;
    const is_active = patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : current.is_active;
    const sort_order = patch.sort_order ?? current.sort_order;
    await exec(
      `UPDATE subscription_plans SET name=$1, price_pence=$2, trial_days=$3, max_learners=$4, max_instructors=$5, max_courses=$6, features_json=$7, is_active=$8, sort_order=$9, updated_at=$10 WHERE id=$11`,
      [name, price_pence, trial_days, max_learners, max_instructors, max_courses, features_json, is_active, sort_order, nowIso(), id]
    );
    return Plans.byId(id);
  },
  async delete(id: string): Promise<void> {
    await exec("DELETE FROM subscription_plans WHERE id = $1", [id]);
  },
};

// ---------- Academies ----------
export const Academies = {
  async all(includeDeleted = false): Promise<Academy[]> {
    const sql = includeDeleted
      ? "SELECT * FROM academies ORDER BY created_at DESC"
      : "SELECT * FROM academies WHERE is_deleted = 0 ORDER BY created_at DESC";
    return queryAll<Academy>(sql);
  },
  async byId(id: string): Promise<Academy | undefined> {
    return queryOne<Academy>("SELECT * FROM academies WHERE id = $1", [id]);
  },
  async bySlug(slug: string): Promise<Academy | undefined> {
    return queryOne<Academy>("SELECT * FROM academies WHERE slug = $1 AND is_deleted = 0", [slug]);
  },
  async slugExists(slug: string): Promise<boolean> {
    return !!(await queryOne("SELECT id FROM academies WHERE slug = $1", [slug]));
  },
  async create(input: {
    slug: string;
    name: string;
    sector: string;
    template_id: string;
    plan_id: string;
    trial_days: number;
    logo_text: string;
    contact_email: string;
  }): Promise<Academy> {
    const id = newId();
    const now = nowIso();
    const trialEnds = new Date(Date.now() + input.trial_days * 24 * 60 * 60 * 1000).toISOString();
    await exec(
      `INSERT INTO academies (id, slug, name, sector, template_id, plan_id, subscription_status, trial_ends_at, logo_text, contact_email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'trialing', $7, $8, $9, $10, $11)`,
      [id, input.slug, input.name, input.sector, input.template_id, input.plan_id, trialEnds, input.logo_text, input.contact_email, now, now]
    );
    return (await Academies.byId(id))!;
  },
  async update(
    id: string,
    patch: Partial<{
      name: string;
      template_id: string;
      plan_id: string;
      subscription_status: string;
      logo_text: string;
      is_published: boolean;
      hero_headline: string;
      hero_tagline: string;
      about_text: string;
    }>
  ): Promise<Academy | undefined> {
    const current = await Academies.byId(id);
    if (!current) return undefined;
    const name = patch.name ?? current.name;
    const template_id = patch.template_id ?? current.template_id;
    const plan_id = patch.plan_id ?? current.plan_id;
    const subscription_status = patch.subscription_status ?? current.subscription_status;
    const logo_text = patch.logo_text ?? current.logo_text;
    const is_published = patch.is_published !== undefined ? (patch.is_published ? 1 : 0) : current.is_published;
    const hero_headline = patch.hero_headline ?? current.hero_headline;
    const hero_tagline = patch.hero_tagline ?? current.hero_tagline;
    const about_text = patch.about_text ?? current.about_text;
    await exec(
      `UPDATE academies SET name=$1, template_id=$2, plan_id=$3, subscription_status=$4, logo_text=$5, is_published=$6, hero_headline=$7, hero_tagline=$8, about_text=$9, updated_at=$10 WHERE id=$11`,
      [name, template_id, plan_id, subscription_status, logo_text, is_published, hero_headline, hero_tagline, about_text, nowIso(), id]
    );
    return Academies.byId(id);
  },
  async softDelete(id: string): Promise<void> {
    await exec("UPDATE academies SET is_deleted = 1, updated_at=$1 WHERE id = $2", [nowIso(), id]);
  },
  async restore(id: string): Promise<void> {
    await exec("UPDATE academies SET is_deleted = 0, updated_at=$1 WHERE id = $2", [nowIso(), id]);
  },
};

// ---------- Users ----------
export const Users = {
  async byId(id: string): Promise<AppUser | undefined> {
    return queryOne<AppUser>("SELECT * FROM users WHERE id = $1", [id]);
  },
  async byAcademyAndEmail(academyId: string, email: string): Promise<AppUser | undefined> {
    return queryOne<AppUser>("SELECT * FROM users WHERE academy_id = $1 AND lower(email) = lower($2)", [academyId, email]);
  },
  async listByAcademy(academyId: string, role?: Role): Promise<AppUser[]> {
    if (role) {
      return queryAll<AppUser>("SELECT * FROM users WHERE academy_id = $1 AND role = $2 ORDER BY created_at DESC", [academyId, role]);
    }
    return queryAll<AppUser>("SELECT * FROM users WHERE academy_id = $1 ORDER BY created_at DESC", [academyId]);
  },
  async create(input: {
    academy_id: string | null;
    role: Role;
    name: string;
    email: string;
    password_hash: string;
  }): Promise<AppUser> {
    const id = newId();
    await exec(
      `INSERT INTO users (id, academy_id, role, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, input.academy_id, input.role, input.name, input.email, input.password_hash, nowIso()]
    );
    return (await Users.byId(id))!;
  },
  async setActive(id: string, active: boolean): Promise<void> {
    await exec("UPDATE users SET is_active = $1 WHERE id = $2", [active ? 1 : 0, id]);
  },
  async remove(id: string): Promise<void> {
    await exec("DELETE FROM users WHERE id = $1", [id]);
  },
};

export const SuperAdmins = {
  async byEmail(email: string) {
    return queryOne<{ id: string; name: string; email: string; password_hash: string }>(
      "SELECT * FROM super_admins WHERE lower(email) = lower($1)",
      [email]
    );
  },
  async byId(id: string) {
    return queryOne<{ id: string; name: string; email: string; password_hash: string }>(
      "SELECT * FROM super_admins WHERE id = $1",
      [id]
    );
  },
  async create(input: { name: string; email: string; password_hash: string }) {
    const id = newId();
    await exec(`INSERT INTO super_admins (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)`, [
      id,
      input.name,
      input.email,
      input.password_hash,
      nowIso(),
    ]);
    return (await SuperAdmins.byId(id))!;
  },
};

// ---------- Courses ----------
export const Courses = {
  async byId(id: string): Promise<Course | undefined> {
    return queryOne<Course>("SELECT * FROM courses WHERE id = $1", [id]);
  },
  async listByAcademy(academyId: string, publishedOnly = false): Promise<Course[]> {
    const sql = publishedOnly
      ? "SELECT * FROM courses WHERE academy_id = $1 AND is_published = 1 ORDER BY created_at DESC"
      : "SELECT * FROM courses WHERE academy_id = $1 ORDER BY created_at DESC";
    return queryAll<Course>(sql, [academyId]);
  },
  async create(input: {
    academy_id: string;
    created_by: string;
    title: string;
    description: string;
    category: string;
    price_pence: number;
    cover_emoji: string;
  }): Promise<Course> {
    const id = newId();
    const now = nowIso();
    await exec(
      `INSERT INTO courses (id, academy_id, created_by, title, description, category, price_pence, cover_emoji, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, input.academy_id, input.created_by, input.title, input.description, input.category, input.price_pence, input.cover_emoji, now, now]
    );
    return (await Courses.byId(id))!;
  },
  async update(
    id: string,
    patch: Partial<{ title: string; description: string; category: string; price_pence: number; is_published: boolean; cover_emoji: string }>
  ): Promise<Course | undefined> {
    const current = await Courses.byId(id);
    if (!current) return undefined;
    const title = patch.title ?? current.title;
    const description = patch.description ?? current.description;
    const category = patch.category ?? current.category;
    const price_pence = patch.price_pence ?? current.price_pence;
    const is_published = patch.is_published !== undefined ? (patch.is_published ? 1 : 0) : current.is_published;
    const cover_emoji = patch.cover_emoji ?? current.cover_emoji;
    await exec(
      `UPDATE courses SET title=$1, description=$2, category=$3, price_pence=$4, is_published=$5, cover_emoji=$6, updated_at=$7 WHERE id=$8`,
      [title, description, category, price_pence, is_published, cover_emoji, nowIso(), id]
    );
    return Courses.byId(id);
  },
  async remove(id: string): Promise<void> {
    await exec("DELETE FROM courses WHERE id = $1", [id]);
  },
};

// ---------- Modules ----------
export const Modules = {
  async byId(id: string): Promise<ModuleRow | undefined> {
    return queryOne<ModuleRow>("SELECT * FROM modules WHERE id = $1", [id]);
  },
  async listByAcademy(academyId: string): Promise<ModuleRow[]> {
    return queryAll<ModuleRow>("SELECT * FROM modules WHERE academy_id = $1 ORDER BY created_at DESC", [academyId]);
  },
  async listByCourse(courseId: string): Promise<(ModuleRow & { order_index: number; course_module_id: string })[]> {
    return queryAll<ModuleRow & { order_index: number; course_module_id: string }>(
      `SELECT m.*, cm.order_index as order_index, cm.id as course_module_id
       FROM modules m JOIN course_modules cm ON cm.module_id = m.id
       WHERE cm.course_id = $1 ORDER BY cm.order_index ASC`,
      [courseId]
    );
  },
  async create(input: {
    academy_id: string;
    created_by: string;
    title: string;
    description: string;
    content_type: "TEXT" | "URL" | "FILE";
    content_text?: string | null;
    content_url?: string | null;
    file_path?: string | null;
    file_name?: string | null;
    file_mime?: string | null;
    file_size?: number | null;
  }): Promise<ModuleRow> {
    const id = newId();
    const now = nowIso();
    await exec(
      `INSERT INTO modules (id, academy_id, created_by, title, description, content_type, content_text, content_url, file_path, file_name, file_mime, file_size, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        input.academy_id,
        input.created_by,
        input.title,
        input.description,
        input.content_type,
        input.content_text ?? null,
        input.content_url ?? null,
        input.file_path ?? null,
        input.file_name ?? null,
        input.file_mime ?? null,
        input.file_size ?? null,
        now,
        now,
      ]
    );
    return (await Modules.byId(id))!;
  },
  async remove(id: string): Promise<void> {
    await exec("DELETE FROM modules WHERE id = $1", [id]);
  },
  async assignToCourse(courseId: string, moduleId: string, orderIndex: number): Promise<void> {
    const id = newId();
    await exec(
      `INSERT INTO course_modules (id, course_id, module_id, order_index) VALUES ($1, $2, $3, $4)
       ON CONFLICT (course_id, module_id) DO NOTHING`,
      [id, courseId, moduleId, orderIndex]
    );
  },
  async unassignFromCourse(courseId: string, moduleId: string): Promise<void> {
    await exec("DELETE FROM course_modules WHERE course_id = $1 AND module_id = $2", [courseId, moduleId]);
  },
};

// ---------- Course & Module Instructor Assignments ----------
// Organisational assignment only — every instructor in an academy already
// has full access to all of that academy's courses/modules. These tables
// record who is *designated* as teaching a course or owning a module, for
// visibility/reporting, without changing access control.
export const CourseInstructors = {
  async listByCourse(courseId: string): Promise<AppUser[]> {
    return queryAll<AppUser>(
      `SELECT u.* FROM users u JOIN course_instructors ci ON ci.instructor_id = u.id
       WHERE ci.course_id = $1 ORDER BY u.name`,
      [courseId]
    );
  },
  async listByInstructor(instructorId: string): Promise<{ course_id: string }[]> {
    return queryAll<{ course_id: string }>("SELECT course_id FROM course_instructors WHERE instructor_id = $1", [instructorId]);
  },
  async assign(courseId: string, instructorId: string): Promise<void> {
    const id = newId();
    await exec(
      `INSERT INTO course_instructors (id, course_id, instructor_id, assigned_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (course_id, instructor_id) DO NOTHING`,
      [id, courseId, instructorId, nowIso()]
    );
  },
  async unassign(courseId: string, instructorId: string): Promise<void> {
    await exec("DELETE FROM course_instructors WHERE course_id = $1 AND instructor_id = $2", [courseId, instructorId]);
  },
};

export const ModuleInstructors = {
  async listByModule(moduleId: string): Promise<AppUser[]> {
    return queryAll<AppUser>(
      `SELECT u.* FROM users u JOIN module_instructors mi ON mi.instructor_id = u.id
       WHERE mi.module_id = $1 ORDER BY u.name`,
      [moduleId]
    );
  },
  async assign(moduleId: string, instructorId: string): Promise<void> {
    const id = newId();
    await exec(
      `INSERT INTO module_instructors (id, module_id, instructor_id, assigned_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (module_id, instructor_id) DO NOTHING`,
      [id, moduleId, instructorId, nowIso()]
    );
  },
  async unassign(moduleId: string, instructorId: string): Promise<void> {
    await exec("DELETE FROM module_instructors WHERE module_id = $1 AND instructor_id = $2", [moduleId, instructorId]);
  },
};

// ---------- Enrollments ----------
export const Enrollments = {
  async byId(id: string): Promise<Enrollment | undefined> {
    return queryOne<Enrollment>("SELECT * FROM enrollments WHERE id = $1", [id]);
  },
  async byCourseAndLearner(courseId: string, learnerId: string): Promise<Enrollment | undefined> {
    return queryOne<Enrollment>("SELECT * FROM enrollments WHERE course_id = $1 AND learner_id = $2", [courseId, learnerId]);
  },
  async listByLearner(learnerId: string): Promise<Enrollment[]> {
    return queryAll<Enrollment>("SELECT * FROM enrollments WHERE learner_id = $1 ORDER BY enrolled_at DESC", [learnerId]);
  },
  async listByCourse(courseId: string): Promise<Enrollment[]> {
    return queryAll<Enrollment>("SELECT * FROM enrollments WHERE course_id = $1 ORDER BY enrolled_at DESC", [courseId]);
  },
  async create(input: {
    academy_id: string;
    course_id: string;
    learner_id: string;
    payment_status: "unpaid" | "paid" | "free";
  }): Promise<Enrollment> {
    const id = newId();
    await exec(
      `INSERT INTO enrollments (id, academy_id, course_id, learner_id, payment_status, enrolled_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, input.academy_id, input.course_id, input.learner_id, input.payment_status, nowIso()]
    );
    return (await Enrollments.byId(id))!;
  },
  async markPaid(id: string): Promise<void> {
    await exec("UPDATE enrollments SET payment_status = 'paid' WHERE id = $1", [id]);
  },
  async setProgress(id: string, pct: number): Promise<void> {
    await exec("UPDATE enrollments SET progress_pct = $1 WHERE id = $2", [pct, id]);
  },
};

export const ModuleCompletions = {
  async isComplete(enrollmentId: string, moduleId: string): Promise<boolean> {
    return !!(await queryOne("SELECT id FROM module_completions WHERE enrollment_id = $1 AND module_id = $2", [enrollmentId, moduleId]));
  },
  async listByEnrollment(enrollmentId: string): Promise<string[]> {
    const rows = await queryAll<{ module_id: string }>("SELECT module_id FROM module_completions WHERE enrollment_id = $1", [enrollmentId]);
    return rows.map((r) => r.module_id);
  },
  async complete(enrollmentId: string, moduleId: string): Promise<void> {
    const id = newId();
    await exec(
      `INSERT INTO module_completions (id, enrollment_id, module_id, completed_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (enrollment_id, module_id) DO NOTHING`,
      [id, enrollmentId, moduleId, nowIso()]
    );
  },
};

// ---------- Payments ----------
export interface Payment {
  id: string;
  academy_id: string;
  learner_id: string;
  course_id: string | null;
  amount_pence: number;
  currency: string;
  status: string;
  provider: string;
  card_last4: string | null;
  created_at: string;
}

export const Payments = {
  async create(input: {
    academy_id: string;
    learner_id: string;
    course_id: string | null;
    amount_pence: number;
    card_last4: string;
  }): Promise<Payment | undefined> {
    const id = newId();
    await exec(
      `INSERT INTO payments (id, academy_id, learner_id, course_id, amount_pence, card_last4, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, input.academy_id, input.learner_id, input.course_id, input.amount_pence, input.card_last4, nowIso()]
    );
    return queryOne<Payment>("SELECT * FROM payments WHERE id = $1", [id]);
  },
  async listByAcademy(academyId: string): Promise<Payment[]> {
    return queryAll<Payment>("SELECT * FROM payments WHERE academy_id = $1 ORDER BY created_at DESC", [academyId]);
  },
  async listByLearner(learnerId: string): Promise<Payment[]> {
    return queryAll<Payment>("SELECT * FROM payments WHERE learner_id = $1 ORDER BY created_at DESC", [learnerId]);
  },
};

// ---------- Subscription Invoices ----------
export interface SubscriptionInvoice {
  id: string;
  academy_id: string;
  plan_id: string;
  amount_pence: number;
  status: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

export const SubscriptionInvoices = {
  async create(input: { academy_id: string; plan_id: string; amount_pence: number }): Promise<SubscriptionInvoice | undefined> {
    const id = newId();
    const start = nowIso();
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await exec(
      `INSERT INTO subscription_invoices (id, academy_id, plan_id, amount_pence, period_start, period_end, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, input.academy_id, input.plan_id, input.amount_pence, start, end, start]
    );
    return queryOne<SubscriptionInvoice>("SELECT * FROM subscription_invoices WHERE id = $1", [id]);
  },
  async listByAcademy(academyId: string): Promise<SubscriptionInvoice[]> {
    return queryAll<SubscriptionInvoice>("SELECT * FROM subscription_invoices WHERE academy_id = $1 ORDER BY created_at DESC", [academyId]);
  },
};

export const PlatformSettings = {
  async get(key: string, fallback: string): Promise<string> {
    const row = await queryOne<{ value: string }>("SELECT value FROM platform_settings WHERE key = $1", [key]);
    return row ? row.value : fallback;
  },
  async set(key: string, value: string): Promise<void> {
    await exec(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, nowIso()]
    );
  },
  async all(): Promise<Record<string, string>> {
    const rows = await queryAll<{ key: string; value: string }>("SELECT key, value FROM platform_settings");
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  },
};

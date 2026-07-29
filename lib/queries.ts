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
  certification_enabled: number;
  seo_meta_title: string | null;
  seo_meta_description: string | null;
  seo_og_image_path: string | null;
  seo_schema_json: string | null;
  seo_social_copy_json: string | null;
  seo_ad_snippet_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModuleRow {
  id: string;
  academy_id: string;
  created_by: string;
  title: string;
  description: string;
  content_type: "TEXT" | "URL" | "FILE" | "LIVE_SESSION" | "QUIZ" | "SCORM";
  content_text: string | null;
  content_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  live_provider: "zoom" | "microsoft" | null;
  live_meeting_id: string | null;
  live_join_url: string | null;
  live_start_url: string | null;
  live_start_time: string | null;
  live_duration_minutes: number | null;
  live_password: string | null;
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
  async setCertificationEnabled(id: string, enabled: boolean): Promise<void> {
    await exec("UPDATE courses SET certification_enabled = $1, updated_at = $2 WHERE id = $3", [enabled ? 1 : 0, nowIso(), id]);
  },
  async updateSeo(
    id: string,
    patch: Partial<{
      seo_meta_title: string | null;
      seo_meta_description: string | null;
      seo_og_image_path: string | null;
      seo_schema_json: string | null;
      seo_social_copy_json: string | null;
      seo_ad_snippet_json: string | null;
    }>
  ): Promise<Course | undefined> {
    const current = await Courses.byId(id);
    if (!current) return undefined;
    await exec(
      `UPDATE courses SET seo_meta_title=$1, seo_meta_description=$2, seo_og_image_path=$3, seo_schema_json=$4, seo_social_copy_json=$5, seo_ad_snippet_json=$6, updated_at=$7 WHERE id=$8`,
      [
        patch.seo_meta_title !== undefined ? patch.seo_meta_title : current.seo_meta_title,
        patch.seo_meta_description !== undefined ? patch.seo_meta_description : current.seo_meta_description,
        patch.seo_og_image_path !== undefined ? patch.seo_og_image_path : current.seo_og_image_path,
        patch.seo_schema_json !== undefined ? patch.seo_schema_json : current.seo_schema_json,
        patch.seo_social_copy_json !== undefined ? patch.seo_social_copy_json : current.seo_social_copy_json,
        patch.seo_ad_snippet_json !== undefined ? patch.seo_ad_snippet_json : current.seo_ad_snippet_json,
        nowIso(),
        id,
      ]
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
    content_type: "TEXT" | "URL" | "FILE" | "LIVE_SESSION" | "QUIZ" | "SCORM";
    content_text?: string | null;
    content_url?: string | null;
    file_path?: string | null;
    file_name?: string | null;
    file_mime?: string | null;
    file_size?: number | null;
    live_provider?: "zoom" | "microsoft" | null;
    live_meeting_id?: string | null;
    live_join_url?: string | null;
    live_start_url?: string | null;
    live_start_time?: string | null;
    live_duration_minutes?: number | null;
    live_password?: string | null;
  }): Promise<ModuleRow> {
    const id = newId();
    const now = nowIso();
    await exec(
      `INSERT INTO modules (id, academy_id, created_by, title, description, content_type, content_text, content_url, file_path, file_name, file_mime, file_size, live_provider, live_meeting_id, live_join_url, live_start_url, live_start_time, live_duration_minutes, live_password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
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
        input.live_provider ?? null,
        input.live_meeting_id ?? null,
        input.live_join_url ?? null,
        input.live_start_url ?? null,
        input.live_start_time ?? null,
        input.live_duration_minutes ?? null,
        input.live_password ?? null,
        now,
        now,
      ]
    );
    return (await Modules.byId(id))!;
  },
  async setLiveMeeting(
    id: string,
    patch: {
      live_provider: "zoom" | "microsoft";
      live_meeting_id: string;
      live_join_url: string;
      live_start_url: string | null;
      live_start_time: string | null;
      live_duration_minutes: number | null;
      live_password: string | null;
    }
  ): Promise<void> {
    await exec(
      `UPDATE modules SET live_provider=$1, live_meeting_id=$2, live_join_url=$3, live_start_url=$4, live_start_time=$5, live_duration_minutes=$6, live_password=$7, updated_at=$8 WHERE id=$9`,
      [
        patch.live_provider,
        patch.live_meeting_id,
        patch.live_join_url,
        patch.live_start_url,
        patch.live_start_time,
        patch.live_duration_minutes,
        patch.live_password,
        nowIso(),
        id,
      ]
    );
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

// ---------- Live classes (Zoom / Microsoft Teams) ----------
export interface AcademyIntegration {
  id: string;
  academy_id: string;
  provider: "zoom" | "microsoft";
  external_account_id: string | null;
  external_account_email: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: string;
  scope: string;
  connected_by: string;
  connected_at: string;
  updated_at: string;
}

export const AcademyIntegrations = {
  async byAcademyAndProvider(academyId: string, provider: "zoom" | "microsoft"): Promise<AcademyIntegration | undefined> {
    return queryOne<AcademyIntegration>("SELECT * FROM academy_integrations WHERE academy_id = $1 AND provider = $2", [
      academyId,
      provider,
    ]);
  },
  async listByAcademy(academyId: string): Promise<AcademyIntegration[]> {
    return queryAll<AcademyIntegration>("SELECT * FROM academy_integrations WHERE academy_id = $1", [academyId]);
  },
  async upsert(input: {
    academy_id: string;
    provider: "zoom" | "microsoft";
    external_account_id: string | null;
    external_account_email: string | null;
    access_token_enc: string;
    refresh_token_enc: string;
    token_expires_at: string;
    scope: string;
    connected_by: string;
  }): Promise<AcademyIntegration> {
    const id = newId();
    const now = nowIso();
    await exec(
      `INSERT INTO academy_integrations
         (id, academy_id, provider, external_account_id, external_account_email, access_token_enc, refresh_token_enc, token_expires_at, scope, connected_by, connected_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (academy_id, provider) DO UPDATE SET
         external_account_id = excluded.external_account_id,
         external_account_email = excluded.external_account_email,
         access_token_enc = excluded.access_token_enc,
         refresh_token_enc = excluded.refresh_token_enc,
         token_expires_at = excluded.token_expires_at,
         scope = excluded.scope,
         connected_by = excluded.connected_by,
         updated_at = excluded.updated_at`,
      [
        id,
        input.academy_id,
        input.provider,
        input.external_account_id,
        input.external_account_email,
        input.access_token_enc,
        input.refresh_token_enc,
        input.token_expires_at,
        input.scope,
        input.connected_by,
        now,
        now,
      ]
    );
    return (await AcademyIntegrations.byAcademyAndProvider(input.academy_id, input.provider))!;
  },
  async updateTokens(
    academyId: string,
    provider: "zoom" | "microsoft",
    patch: { access_token_enc: string; refresh_token_enc: string; token_expires_at: string }
  ): Promise<void> {
    await exec(
      `UPDATE academy_integrations SET access_token_enc=$1, refresh_token_enc=$2, token_expires_at=$3, updated_at=$4
       WHERE academy_id=$5 AND provider=$6`,
      [patch.access_token_enc, patch.refresh_token_enc, patch.token_expires_at, nowIso(), academyId, provider]
    );
  },
  async disconnect(academyId: string, provider: "zoom" | "microsoft"): Promise<void> {
    await exec("DELETE FROM academy_integrations WHERE academy_id = $1 AND provider = $2", [academyId, provider]);
  },
};

// ---------- Quizzes / assessments ----------
export interface Quiz {
  id: string;
  academy_id: string;
  module_id: string | null;
  course_id: string | null;
  created_by: string;
  title: string;
  description: string;
  pass_threshold_pct: number;
  time_limit_minutes: number | null;
  max_attempts: number | null;
  shuffle_questions: number;
  created_at: string;
  updated_at: string;
}

export type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "short_answer";

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_type: QuestionType;
  prompt: string;
  points: number;
  order_index: number;
  short_answer_accepted: string | null;
}

export interface QuizOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: number;
  order_index: number;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  learner_id: string;
  enrollment_id: string | null;
  started_at: string;
  submitted_at: string | null;
  score_pct: number | null;
  passed: number;
  answers_json: string;
}

export const Quizzes = {
  async byId(id: string): Promise<Quiz | undefined> {
    return queryOne<Quiz>("SELECT * FROM quizzes WHERE id = $1", [id]);
  },
  async byModule(moduleId: string): Promise<Quiz | undefined> {
    return queryOne<Quiz>("SELECT * FROM quizzes WHERE module_id = $1", [moduleId]);
  },
  async listByCourse(courseId: string): Promise<Quiz[]> {
    return queryAll<Quiz>("SELECT * FROM quizzes WHERE course_id = $1 ORDER BY created_at", [courseId]);
  },
  async listByAcademy(academyId: string): Promise<Quiz[]> {
    return queryAll<Quiz>("SELECT * FROM quizzes WHERE academy_id = $1 ORDER BY created_at DESC", [academyId]);
  },
  async create(input: {
    academy_id: string;
    module_id: string | null;
    course_id: string | null;
    created_by: string;
    title: string;
    description: string;
    pass_threshold_pct: number;
    time_limit_minutes: number | null;
    max_attempts: number | null;
    shuffle_questions: boolean;
  }): Promise<Quiz> {
    const id = newId();
    const now = nowIso();
    await exec(
      `INSERT INTO quizzes (id, academy_id, module_id, course_id, created_by, title, description, pass_threshold_pct, time_limit_minutes, max_attempts, shuffle_questions, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        input.academy_id,
        input.module_id,
        input.course_id,
        input.created_by,
        input.title,
        input.description,
        input.pass_threshold_pct,
        input.time_limit_minutes,
        input.max_attempts,
        input.shuffle_questions ? 1 : 0,
        now,
        now,
      ]
    );
    return (await Quizzes.byId(id))!;
  },
  async update(
    id: string,
    patch: Partial<{
      title: string;
      description: string;
      pass_threshold_pct: number;
      time_limit_minutes: number | null;
      max_attempts: number | null;
      shuffle_questions: boolean;
    }>
  ): Promise<Quiz | undefined> {
    const current = await Quizzes.byId(id);
    if (!current) return undefined;
    await exec(
      `UPDATE quizzes SET title=$1, description=$2, pass_threshold_pct=$3, time_limit_minutes=$4, max_attempts=$5, shuffle_questions=$6, updated_at=$7 WHERE id=$8`,
      [
        patch.title ?? current.title,
        patch.description ?? current.description,
        patch.pass_threshold_pct ?? current.pass_threshold_pct,
        patch.time_limit_minutes !== undefined ? patch.time_limit_minutes : current.time_limit_minutes,
        patch.max_attempts !== undefined ? patch.max_attempts : current.max_attempts,
        patch.shuffle_questions !== undefined ? (patch.shuffle_questions ? 1 : 0) : current.shuffle_questions,
        nowIso(),
        id,
      ]
    );
    return Quizzes.byId(id);
  },
  async remove(id: string): Promise<void> {
    await exec("DELETE FROM quizzes WHERE id = $1", [id]);
  },
};

export const QuizQuestions = {
  async listByQuiz(quizId: string): Promise<QuizQuestion[]> {
    return queryAll<QuizQuestion>("SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_index ASC", [quizId]);
  },
  async byId(id: string): Promise<QuizQuestion | undefined> {
    return queryOne<QuizQuestion>("SELECT * FROM quiz_questions WHERE id = $1", [id]);
  },
  async create(input: {
    quiz_id: string;
    question_type: QuestionType;
    prompt: string;
    points: number;
    order_index: number;
    short_answer_accepted?: string[] | null;
  }): Promise<QuizQuestion> {
    const id = newId();
    await exec(
      `INSERT INTO quiz_questions (id, quiz_id, question_type, prompt, points, order_index, short_answer_accepted) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        input.quiz_id,
        input.question_type,
        input.prompt,
        input.points,
        input.order_index,
        input.short_answer_accepted ? JSON.stringify(input.short_answer_accepted) : null,
      ]
    );
    return (await QuizQuestions.byId(id))!;
  },
  async remove(id: string): Promise<void> {
    await exec("DELETE FROM quiz_questions WHERE id = $1", [id]);
  },
};

export const QuizOptions = {
  async listByQuestion(questionId: string): Promise<QuizOption[]> {
    return queryAll<QuizOption>("SELECT * FROM quiz_options WHERE question_id = $1 ORDER BY order_index ASC", [questionId]);
  },
  async listByQuestions(questionIds: string[]): Promise<QuizOption[]> {
    if (questionIds.length === 0) return [];
    return queryAll<QuizOption>(
      `SELECT * FROM quiz_options WHERE question_id = ANY($1::text[]) ORDER BY order_index ASC`,
      [questionIds]
    );
  },
  async create(input: { question_id: string; option_text: string; is_correct: boolean; order_index: number }): Promise<QuizOption> {
    const id = newId();
    await exec(
      `INSERT INTO quiz_options (id, question_id, option_text, is_correct, order_index) VALUES ($1, $2, $3, $4, $5)`,
      [id, input.question_id, input.option_text, input.is_correct ? 1 : 0, input.order_index]
    );
    return (await queryOne<QuizOption>("SELECT * FROM quiz_options WHERE id = $1", [id]))!;
  },
};

export const QuizAttempts = {
  async byId(id: string): Promise<QuizAttempt | undefined> {
    return queryOne<QuizAttempt>("SELECT * FROM quiz_attempts WHERE id = $1", [id]);
  },
  async listByQuizAndLearner(quizId: string, learnerId: string): Promise<QuizAttempt[]> {
    return queryAll<QuizAttempt>(
      "SELECT * FROM quiz_attempts WHERE quiz_id = $1 AND learner_id = $2 ORDER BY started_at DESC",
      [quizId, learnerId]
    );
  },
  async hasPassed(quizId: string, learnerId: string): Promise<boolean> {
    return !!(await queryOne(
      "SELECT id FROM quiz_attempts WHERE quiz_id = $1 AND learner_id = $2 AND passed = 1 LIMIT 1",
      [quizId, learnerId]
    ));
  },
  async start(input: { quiz_id: string; learner_id: string; enrollment_id: string | null }): Promise<QuizAttempt> {
    const id = newId();
    await exec(
      `INSERT INTO quiz_attempts (id, quiz_id, learner_id, enrollment_id, started_at, answers_json) VALUES ($1, $2, $3, $4, $5, '{}')`,
      [id, input.quiz_id, input.learner_id, input.enrollment_id, nowIso()]
    );
    return (await QuizAttempts.byId(id))!;
  },
  async submit(id: string, input: { score_pct: number; passed: boolean; answers_json: string }): Promise<void> {
    await exec(
      `UPDATE quiz_attempts SET submitted_at=$1, score_pct=$2, passed=$3, answers_json=$4 WHERE id=$5`,
      [nowIso(), input.score_pct, input.passed ? 1 : 0, input.answers_json, id]
    );
  },
};

// ---------- SCORM packages ----------
export interface ScormPackage {
  id: string;
  module_id: string;
  academy_id: string;
  version: "1.2" | "2004";
  title: string;
  launch_path: string;
  storage_prefix: string;
  manifest_identifier: string | null;
  uploaded_at: string;
}

export interface ScormAttempt {
  id: string;
  scorm_package_id: string;
  learner_id: string;
  enrollment_id: string | null;
  lesson_status: string | null;
  completion_status: string | null;
  success_status: string | null;
  score_raw: number | null;
  suspend_data: string | null;
  started_at: string;
  updated_at: string;
}

export const ScormPackages = {
  async byId(id: string): Promise<ScormPackage | undefined> {
    return queryOne<ScormPackage>("SELECT * FROM scorm_packages WHERE id = $1", [id]);
  },
  async byModule(moduleId: string): Promise<ScormPackage | undefined> {
    return queryOne<ScormPackage>("SELECT * FROM scorm_packages WHERE module_id = $1", [moduleId]);
  },
  async create(input: {
    module_id: string;
    academy_id: string;
    version: "1.2" | "2004";
    title: string;
    launch_path: string;
    storage_prefix: string;
    manifest_identifier: string | null;
  }): Promise<ScormPackage> {
    const id = newId();
    await exec(
      `INSERT INTO scorm_packages (id, module_id, academy_id, version, title, launch_path, storage_prefix, manifest_identifier, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, input.module_id, input.academy_id, input.version, input.title, input.launch_path, input.storage_prefix, input.manifest_identifier, nowIso()]
    );
    return (await ScormPackages.byId(id))!;
  },
  async remove(id: string): Promise<void> {
    await exec("DELETE FROM scorm_packages WHERE id = $1", [id]);
  },
};

export const ScormAttempts = {
  async byPackageAndLearner(packageId: string, learnerId: string): Promise<ScormAttempt | undefined> {
    return queryOne<ScormAttempt>("SELECT * FROM scorm_attempts WHERE scorm_package_id = $1 AND learner_id = $2", [
      packageId,
      learnerId,
    ]);
  },
  async upsert(input: {
    scorm_package_id: string;
    learner_id: string;
    enrollment_id: string | null;
    lesson_status?: string | null;
    completion_status?: string | null;
    success_status?: string | null;
    score_raw?: number | null;
    suspend_data?: string | null;
  }): Promise<ScormAttempt> {
    const existing = await ScormAttempts.byPackageAndLearner(input.scorm_package_id, input.learner_id);
    const now = nowIso();
    if (existing) {
      await exec(
        `UPDATE scorm_attempts SET lesson_status=$1, completion_status=$2, success_status=$3, score_raw=$4, suspend_data=$5, updated_at=$6
         WHERE id=$7`,
        [
          input.lesson_status ?? existing.lesson_status,
          input.completion_status ?? existing.completion_status,
          input.success_status ?? existing.success_status,
          input.score_raw ?? existing.score_raw,
          input.suspend_data ?? existing.suspend_data,
          now,
          existing.id,
        ]
      );
      return (await ScormAttempts.byPackageAndLearner(input.scorm_package_id, input.learner_id))!;
    }
    const id = newId();
    await exec(
      `INSERT INTO scorm_attempts (id, scorm_package_id, learner_id, enrollment_id, lesson_status, completion_status, success_status, score_raw, suspend_data, started_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        input.scorm_package_id,
        input.learner_id,
        input.enrollment_id,
        input.lesson_status ?? null,
        input.completion_status ?? null,
        input.success_status ?? null,
        input.score_raw ?? null,
        input.suspend_data ?? null,
        now,
        now,
      ]
    );
    return (await ScormAttempts.byPackageAndLearner(input.scorm_package_id, input.learner_id))!;
  },
  isPassingOrComplete(attempt: ScormAttempt | undefined): boolean {
    if (!attempt) return false;
    // SCORM 1.2: lesson_status of 'completed' or 'passed' counts as done.
    // SCORM 2004: completion_status 'completed' AND (no success requirement,
    // or success_status isn't 'failed') counts as done.
    if (attempt.lesson_status === "completed" || attempt.lesson_status === "passed") return true;
    if (attempt.completion_status === "completed" && attempt.success_status !== "failed") return true;
    return false;
  },
};

// ---------- Certification ----------
export interface Certificate {
  id: string;
  academy_id: string;
  course_id: string;
  learner_id: string;
  enrollment_id: string | null;
  certificate_number: string;
  pdf_path: string;
  issued_at: string;
}

export const Certificates = {
  async byId(id: string): Promise<Certificate | undefined> {
    return queryOne<Certificate>("SELECT * FROM certificates WHERE id = $1", [id]);
  },
  async byCourseAndLearner(courseId: string, learnerId: string): Promise<Certificate | undefined> {
    return queryOne<Certificate>("SELECT * FROM certificates WHERE course_id = $1 AND learner_id = $2", [courseId, learnerId]);
  },
  async byCertificateNumber(certNumber: string): Promise<Certificate | undefined> {
    return queryOne<Certificate>("SELECT * FROM certificates WHERE certificate_number = $1", [certNumber]);
  },
  async listByLearner(learnerId: string): Promise<Certificate[]> {
    return queryAll<Certificate>("SELECT * FROM certificates WHERE learner_id = $1 ORDER BY issued_at DESC", [learnerId]);
  },
  async create(input: {
    academy_id: string;
    course_id: string;
    learner_id: string;
    enrollment_id: string | null;
    certificate_number: string;
    pdf_path: string;
  }): Promise<Certificate> {
    const id = newId();
    await exec(
      `INSERT INTO certificates (id, academy_id, course_id, learner_id, enrollment_id, certificate_number, pdf_path, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (course_id, learner_id) DO NOTHING`,
      [id, input.academy_id, input.course_id, input.learner_id, input.enrollment_id, input.certificate_number, input.pdf_path, nowIso()]
    );
    return (await Certificates.byCourseAndLearner(input.course_id, input.learner_id))!;
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

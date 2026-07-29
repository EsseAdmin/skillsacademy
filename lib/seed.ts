import { newId, exec, queryOne } from "./db";
import { saveFile } from "./storage";
import {
  Templates,
  Plans,
  Academies,
  Users,
  SuperAdmins,
  Courses,
  Modules,
  Enrollments,
  Payments,
  PlatformSettings,
  CourseInstructors,
  ModuleInstructors,
} from "./queries";
import { hashPassword } from "./auth";

async function seedTemplates() {
  const templates = [
    {
      key: "navy-gold",
      name: "Navy & Gold Executive",
      description: "Polished, premium look with deep navy and gold accents. Great for consultancies and enterprise academies.",
      primary_color: "#0B1F3B",
      secondary_color: "#12294d",
      accent_color: "#FBCB07",
      font_heading: "Playfair Display",
      preview_style: "dark",
    },
    {
      key: "emerald-fresh",
      name: "Emerald Community",
      description: "Warm, approachable emerald and cream palette suited to charities and community organisations.",
      primary_color: "#0F3D32",
      secondary_color: "#155945",
      accent_color: "#F2B705",
      font_heading: "Poppins",
      preview_style: "dark",
    },
    {
      key: "slate-civic",
      name: "Slate Civic",
      description: "Clean, accessible slate-blue design tailored for public sector and government academies.",
      primary_color: "#1E293B",
      secondary_color: "#334155",
      accent_color: "#38BDF8",
      font_heading: "Inter",
      preview_style: "dark",
    },
    {
      key: "crimson-bold",
      name: "Crimson Bold",
      description: "High-energy crimson and charcoal theme for sales, retail and customer-facing training.",
      primary_color: "#1A1A1A",
      secondary_color: "#2B2B2B",
      accent_color: "#E11D48",
      font_heading: "Montserrat",
      preview_style: "dark",
    },
    {
      key: "light-minimal",
      name: "Light Minimal",
      description: "Bright, minimal white-and-indigo theme for a modern, airy learning experience.",
      primary_color: "#F8FAFC",
      secondary_color: "#EEF2FF",
      accent_color: "#4F46E5",
      font_heading: "Inter",
      preview_style: "light",
    },
  ];
  for (const t of templates) {
    // ON CONFLICT DO NOTHING (keyed on the unique `key` column) makes this safe to
    // re-run on every cold start — important because a serverless environment can
    // interrupt ensureSeed() partway through (timeout, concurrent invocation, etc.),
    // and re-running should pick up wherever it left off rather than erroring on
    // rows that already exist from a prior partial run.
    await exec(
      `INSERT INTO templates (id, key, name, description, primary_color, secondary_color, accent_color, font_heading, preview_style)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (key) DO NOTHING`,
      [newId(), t.key, t.name, t.description, t.primary_color, t.secondary_color, t.accent_color, t.font_heading, t.preview_style]
    );
  }
}

// Postgres unique_violation error code — used throughout seeding to make each
// step safe to re-run without a dedicated existence check, since ensureSeed()
// runs on every cold start and may be interrupted partway through.
const PG_UNIQUE_VIOLATION = "23505";
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === PG_UNIQUE_VIOLATION;
}

async function createPlanIfMissing(input: Parameters<typeof Plans.create>[0]) {
  try {
    await Plans.create(input);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

async function seedPlans() {
  await createPlanIfMissing({
    key: "starter",
    name: "Starter",
    price_pence: 4900,
    trial_days: 14,
    max_learners: 50,
    max_instructors: 3,
    max_courses: 10,
    features: [
      "Up to 50 learners",
      "Up to 3 instructors",
      "Up to 10 courses",
      "1 design template of your choice",
      "Course & module content library",
      "Email support",
    ],
    sort_order: 1,
  });
  await createPlanIfMissing({
    key: "growth",
    name: "Growth",
    price_pence: 14900,
    trial_days: 14,
    max_learners: 500,
    max_instructors: 15,
    max_courses: 50,
    features: [
      "Up to 500 learners",
      "Up to 15 instructors",
      "Up to 50 courses",
      "All design templates",
      "Paid course & module checkout",
      "Compliance & progress reporting",
      "Priority support",
    ],
    sort_order: 2,
  });
  await createPlanIfMissing({
    key: "enterprise",
    name: "Enterprise",
    price_pence: 34900,
    trial_days: 14,
    max_learners: null,
    max_instructors: null,
    max_courses: null,
    features: [
      "Unlimited learners & instructors",
      "Unlimited courses",
      "All design templates + custom branding",
      "Advanced compliance & audit trail",
      "Dedicated success manager",
      "SLA-backed support",
    ],
    sort_order: 3,
  });
}

async function seedPlatformSettings() {
  await PlatformSettings.set("certificates_enabled", "true");
  await PlatformSettings.set("charity_discount_enabled", "false");
  await PlatformSettings.set("maintenance_mode", "false");
  await PlatformSettings.set("new_signups_enabled", "true");
  await PlatformSettings.set("platform_name", "SkillsAcademy.ai");
}

async function seedSuperAdmin() {
  try {
    await SuperAdmins.create({
      name: "Platform Super Admin",
      email: "superadmin@skillsacademy.ai",
      password_hash: await hashPassword("SuperAdmin123!"),
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

async function seedDemoFile(): Promise<{ path: string; name: string; mime: string; size: number }> {
  const fileName = "onboarding-checklist.txt";
  const storedKey = `seed-${fileName}`;
  const content =
    "Onboarding Checklist\n\n1. Complete your profile\n2. Review the code of conduct\n3. Watch the welcome video (see linked module)\n4. Message your line manager to confirm completion\n\nThis is a demo downloadable resource showing FILE-type module content (Word, PDF and PowerPoint uploads work the same way).";
  const buffer = Buffer.from(content, "utf-8");
  try {
    await saveFile(storedKey, buffer);
    return { path: storedKey, name: fileName, mime: "text/plain", size: buffer.length };
  } catch (err) {
    // Demo seed data is best-effort — if storage (Blobs or local-disk fallback)
    // isn't writable in this environment, degrade the FILE-type demo module to
    // "no file" (the download route already 404s gracefully on an empty
    // file_path) rather than letting a storage hiccup abort seeding the rest of
    // the academy, users, courses, and modules.
    console.error("seedDemoFile: failed to save demo file, continuing without it", err);
    return { path: "", name: fileName, mime: "text/plain", size: 0 };
  }
}

async function seedAcademy(opts: {
  slug: string;
  name: string;
  sector: string;
  templateKey: string;
  planKey: string;
  contactEmail: string;
  logoText: string;
  trialDaysAgo: number;
  site?: { published: boolean; headline?: string; tagline?: string; about?: string };
  courses: {
    title: string;
    description: string;
    category: string;
    price_pence: number;
    emoji: string;
    modules: { title: string; description: string; kind: "TEXT" | "URL" | "FILE"; text?: string; url?: string }[];
  }[];
}) {
  // Skip cleanly if this academy already exists — makes seedAcademy() safe to
  // call on every cold start, so a prior invocation that was interrupted partway
  // through (timeout, crash, concurrent invocation) doesn't permanently wedge
  // seeding: the next invocation just finishes whichever academies are missing.
  const alreadySeeded = await Academies.bySlug(opts.slug);
  if (alreadySeeded) return;

  const template = (await Templates.all()).find((t) => t.key === opts.templateKey);
  const plan = (await Plans.all()).find((p) => p.key === opts.planKey);
  if (!template || !plan) {
    // Templates/plans are seeded immediately before academies in ensureSeed(), so
    // this should be unreachable — but fail loudly with a clear message instead
    // of a bare non-null-assertion crash if that invariant is ever broken.
    throw new Error(
      `seedAcademy(${opts.slug}): missing template "${opts.templateKey}" or plan "${opts.planKey}" — ` +
        "seedTemplates()/seedPlans() must run successfully before seedAcademy()."
    );
  }
  const academy = await Academies.create({
    slug: opts.slug,
    name: opts.name,
    sector: opts.sector,
    template_id: template.id,
    plan_id: plan.id,
    trial_days: plan.trial_days,
    logo_text: opts.logoText,
    contact_email: opts.contactEmail,
  });
  // backdate trial start for realism
  if (opts.trialDaysAgo > 0) {
    const newTrialEnd = new Date(Date.now() + (plan.trial_days - opts.trialDaysAgo) * 24 * 60 * 60 * 1000).toISOString();
    await exec("UPDATE academies SET trial_ends_at = $1, subscription_status = $2 WHERE id = $3", [
      newTrialEnd,
      opts.trialDaysAgo > plan.trial_days ? "active" : "trialing",
      academy.id,
    ]);
  }

  if (opts.site) {
    await Academies.update(academy.id, {
      is_published: opts.site.published,
      hero_headline: opts.site.headline || "",
      hero_tagline: opts.site.tagline || "",
      about_text: opts.site.about || "",
    });
  }

  const pw = await hashPassword("Password123!");
  const admin = await Users.create({ academy_id: academy.id, role: "ACADEMY_ADMIN", name: `${opts.logoText} Admin`, email: `admin@${opts.slug}.example`, password_hash: pw });
  const instructor = await Users.create({ academy_id: academy.id, role: "INSTRUCTOR", name: `${opts.logoText} Instructor`, email: `instructor@${opts.slug}.example`, password_hash: pw });
  const learner = await Users.create({ academy_id: academy.id, role: "LEARNER", name: `${opts.logoText} Learner`, email: `learner@${opts.slug}.example`, password_hash: pw });
  const learner2 = await Users.create({ academy_id: academy.id, role: "LEARNER", name: "Sam Taylor", email: `sam@${opts.slug}.example`, password_hash: pw });

  const demoFile = await seedDemoFile();

  let firstCourseId: string | null = null;
  for (let ci = 0; ci < opts.courses.length; ci++) {
    const c = opts.courses[ci];
    const course = await Courses.create({
      academy_id: academy.id,
      created_by: instructor.id,
      title: c.title,
      description: c.description,
      category: c.category,
      price_pence: c.price_pence,
      cover_emoji: c.emoji,
    });
    if (ci === 0) firstCourseId = course.id;
    // demonstrate the "assign instructor to a course" capability out of the box
    await CourseInstructors.assign(course.id, instructor.id);
    for (let mi = 0; mi < c.modules.length; mi++) {
      const m = c.modules[mi];
      const mod = await Modules.create({
        academy_id: academy.id,
        created_by: instructor.id,
        title: m.title,
        description: m.description,
        content_type: m.kind,
        content_text: m.kind === "TEXT" ? m.text ?? null : null,
        content_url: m.kind === "URL" ? m.url ?? null : null,
        file_path: m.kind === "FILE" ? demoFile.path : null,
        file_name: m.kind === "FILE" ? demoFile.name : null,
        file_mime: m.kind === "FILE" ? demoFile.mime : null,
        file_size: m.kind === "FILE" ? demoFile.size : null,
      });
      await Modules.assignToCourse(course.id, mod.id, mi);
      // demonstrate the "assign instructor to a module" capability out of the box
      await ModuleInstructors.assign(mod.id, instructor.id);
    }
  }

  // Enroll demo learner in first course
  if (firstCourseId) {
    const paid = opts.courses[0].price_pence > 0;
    const enr = await Enrollments.create({
      academy_id: academy.id,
      course_id: firstCourseId,
      learner_id: learner.id,
      payment_status: paid ? "paid" : "free",
    });
    if (paid) {
      await Payments.create({
        academy_id: academy.id,
        learner_id: learner.id,
        course_id: firstCourseId,
        amount_pence: opts.courses[0].price_pence,
        card_last4: "4242",
      });
    }
    await Enrollments.setProgress(enr.id, 40);
  }

  return { academy, admin, instructor, learner, learner2 };
}

export async function ensureSeed() {
  // Fast path once fully seeded: skip straight past every idempotent step below.
  // Deliberately NOT gated on just "templates exist" — a serverless cold start
  // can be interrupted partway through (execution timeout, concurrent invocation,
  // storage hiccup, etc.), and if it were, this app would need to fully finish
  // seeding the remaining academies on a later invocation rather than treating
  // "some templates got inserted" as "seeding is done forever". Every step in
  // this function is safe to re-run (ON CONFLICT DO NOTHING / unique-violation
  // guards / per-academy existence checks), so re-running is always correct —
  // this early return is purely an optimization for the steady state.
  const fullySeeded = await queryOne(
    "SELECT 1 FROM academies WHERE slug IN ('brightwave', 'riverside', 'northgate') HAVING count(*) = 3"
  );
  if (fullySeeded) return;

  await seedTemplates();
  await seedPlans();
  await seedPlatformSettings();
  await seedSuperAdmin();

  await seedAcademy({
    slug: "brightwave",
    name: "Brightwave Consulting Academy",
    sector: "business",
    templateKey: "navy-gold",
    planKey: "growth",
    contactEmail: "hello@brightwave.example",
    logoText: "Brightwave",
    trialDaysAgo: 10,
    site: {
      published: true,
      headline: "Grow Your Consulting Career With Brightwave",
      tagline: "Practical, on-demand training for every consultant on our team — from onboarding to advanced client skills.",
      about: "Brightwave Consulting Academy is our in-house learning platform for consultants at every level. Every course here is built by our own senior team, covering the frameworks and skills we actually use with clients day to day.",
    },
    courses: [
      {
        title: "Client Onboarding Excellence",
        description: "A practical course covering how to onboard new clients consistently and professionally.",
        category: "Client Success",
        price_pence: 0,
        emoji: "🤝",
        modules: [
          { title: "Welcome & Programme Overview", description: "What you'll learn and how the course is structured.", kind: "TEXT", text: "Welcome to Client Onboarding Excellence!\n\nIn this course you'll learn our proven 5-step onboarding framework used across every client engagement. Complete each module in order and mark it complete when finished." },
          { title: "Onboarding Checklist (download)", description: "Downloadable onboarding checklist resource.", kind: "FILE" },
          { title: "Industry Best Practice Reading", description: "External article on client onboarding best practice.", kind: "URL", url: "https://www.forbes.com/sites/forbesbusinesscouncil/" },
        ],
      },
      {
        title: "Advanced Consulting Skills",
        description: "Sharpen your advisory, negotiation and stakeholder management skills.",
        category: "Professional Development",
        price_pence: 2500,
        emoji: "📈",
        modules: [
          { title: "Stakeholder Mapping", description: "How to map and prioritise stakeholders on an engagement.", kind: "TEXT", text: "Stakeholder mapping helps you identify who has influence and interest in your project so you can tailor your communication accordingly." },
          { title: "Negotiation Fundamentals", description: "Core negotiation tactics for consultants.", kind: "TEXT", text: "Effective negotiation starts with understanding the other party's real interests, not just their stated position." },
        ],
      },
    ],
  });

  await seedAcademy({
    slug: "riverside",
    name: "Riverside Community Trust Academy",
    sector: "charity",
    templateKey: "emerald-fresh",
    planKey: "starter",
    contactEmail: "training@riverside.example",
    logoText: "Riverside",
    trialDaysAgo: 3,
    courses: [
      {
        title: "Safeguarding Fundamentals",
        description: "Mandatory safeguarding training for all staff and volunteers.",
        category: "Compliance",
        price_pence: 0,
        emoji: "🛡️",
        modules: [
          { title: "Introduction to Safeguarding", description: "Core principles every volunteer must know.", kind: "TEXT", text: "Safeguarding is everyone's responsibility. This module covers recognising signs of harm and how to report concerns safely." },
          { title: "Reporting Procedures Handbook", description: "Downloadable reporting procedures.", kind: "FILE" },
          { title: "Statutory Guidance (external)", description: "Link to statutory safeguarding guidance.", kind: "URL", url: "https://www.gov.uk/government/publications/working-together-to-safeguard-children" },
        ],
      },
      {
        title: "Volunteer Induction",
        description: "Everything a new volunteer needs to know in their first week.",
        category: "Onboarding",
        price_pence: 0,
        emoji: "🌱",
        modules: [
          { title: "Our Mission & Values", description: "Why we do what we do.", kind: "TEXT", text: "Riverside Community Trust exists to support families across the region through practical, compassionate services." },
        ],
      },
    ],
  });

  await seedAcademy({
    slug: "northgate",
    name: "Northgate Council Academy",
    sector: "public_sector",
    templateKey: "slate-civic",
    planKey: "enterprise",
    contactEmail: "learning@northgate.example",
    logoText: "Northgate",
    trialDaysAgo: 20,
    courses: [
      {
        title: "GDPR & Data Protection for Officers",
        description: "Statutory data protection training for council officers handling personal data.",
        category: "Compliance",
        price_pence: 0,
        emoji: "🔐",
        modules: [
          { title: "Data Protection Principles", description: "The core UK GDPR principles.", kind: "TEXT", text: "The UK GDPR sets out seven key principles: lawfulness, purpose limitation, data minimisation, accuracy, storage limitation, integrity & confidentiality, and accountability." },
          { title: "Handling a Data Breach", description: "Step-by-step breach response.", kind: "FILE" },
          { title: "ICO Guidance", description: "Official ICO guidance on data protection.", kind: "URL", url: "https://ico.org.uk/for-organisations/" },
        ],
      },
    ],
  });
}

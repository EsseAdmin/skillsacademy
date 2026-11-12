// The three kinds of course an academy offers, a course's level and its study
// time. Pure helpers (no database) shared by the public site, the learner
// portal, the admin screens and the AI plan sanitiser.
export const COURSE_TYPES = ["SELF_PACED", "CERTIFICATION", "INSTRUCTOR_LED"] as const;
export type CourseType = (typeof COURSE_TYPES)[number];
export const DEFAULT_COURSE_TYPE: CourseType = "SELF_PACED";

export const COURSE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];
export const DEFAULT_LEVEL: CourseLevel = "BEGINNER";

export const MAX_STUDY_HOURS = 999;
// A module nobody has timed counts as this many minutes (course hours and module cards).
export const DEFAULT_MODULE_MINUTES = 10;

export function isCourseType(v: unknown): v is CourseType {
  return (COURSE_TYPES as readonly string[]).includes(String(v));
}
export function normalizeCourseType(v: unknown): CourseType {
  const s = String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return isCourseType(s) ? s : DEFAULT_COURSE_TYPE;
}
export function normalizeLevel(v: unknown): CourseLevel {
  const s = String(v ?? "").trim().toUpperCase();
  return (COURSE_LEVELS as readonly string[]).includes(s) ? (s as CourseLevel) : DEFAULT_LEVEL;
}

/** Hours typed by a person or suggested by the AI: 0 (unknown) up to 999, in half-hour steps. */
export function normalizeHours(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_STUDY_HOURS, Math.round(n * 2) / 2);
}

/** Types an academy has switched on (all three until it chooses otherwise). */
export function parseEnabledTypes(stored: string | null | undefined): CourseType[] {
  if (stored === null || stored === undefined) return [...COURSE_TYPES];
  const wanted = new Set(
    String(stored)
      .split(",")
      .map((s) => s.trim())
      .filter(isCourseType)
  );
  return COURSE_TYPES.filter((t) => wanted.has(t));
}
export function serializeEnabledTypes(types: Iterable<CourseType>): string {
  const set = new Set(types);
  return COURSE_TYPES.filter((t) => set.has(t)).join(",");
}
export function isTypeEnabled(stored: string | null | undefined, type: string | null | undefined): boolean {
  return parseEnabledTypes(stored).includes(normalizeCourseType(type));
}

/** Study hours to show for a course: the author's figure, else the total of its modules' minutes (0 = unknown). */
export function courseStudyHours(studyHours: number | null | undefined, moduleMinutes: number): number {
  const own = normalizeHours(studyHours ?? 0);
  if (own > 0) return own;
  return moduleMinutes > 0 ? Math.max(0.5, Math.round((moduleMinutes / 60) * 2) / 2) : 0;
}

/** "30", "1.5" — no trailing zeros. */
export function formatHoursNumber(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/** Minutes a module is expected to take for each kind, used when AI builds it. */
export const MODULE_MINUTES_BY_KIND: Record<string, number> = { SLIDES: 20, DOCUMENT: 15, SCORM: 25, VIDEO: 10, TEXT: 10, URL: 10, EXERCISES: 20 };

export const TYPE_ANCHOR: Record<CourseType, string> = {
  SELF_PACED: "self-paced",
  CERTIFICATION: "certification",
  INSTRUCTOR_LED: "instructor-led",
};

// English names for the admin / instructor screens (learner-facing text lives in lib/i18n).
export const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  SELF_PACED: "Self-paced Training",
  CERTIFICATION: "Certification Pathways",
  INSTRUCTOR_LED: "Instructor-led courses and training",
};
export const COURSE_TYPE_HINT: Record<CourseType, string> = {
  SELF_PACED: "Free and self-paced training learners can start any time.",
  CERTIFICATION: "Structured pathways that build towards a certificate.",
  INSTRUCTOR_LED: "Courses and training delivered with a live instructor.",
};
export const COURSE_LEVEL_LABEL: Record<CourseLevel, string> = { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" };

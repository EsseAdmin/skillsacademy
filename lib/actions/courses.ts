"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Courses, Modules, Users, CourseInstructors } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { saveFile, deleteFile } from "@/lib/storage";
import { sniffImageExtension } from "@/lib/imageSniff";
import { Academies } from "@/lib/queries";
import { parsePaymentUrl } from "@/lib/coursePayment";
import { isCourseType, normalizeCourseType, normalizeLevel, normalizeHours, parseEnabledTypes } from "@/lib/courseTypes";

export async function createCourse(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("category") || "General").trim();
  const priceRaw = String(formData.get("price") || "0");
  const emoji = String(formData.get("emoji") || "📘");
  const course_type = normalizeCourseType(formData.get("course_type"));
  const level = normalizeLevel(formData.get("level"));
  const study_hours = normalizeHours(formData.get("study_hours"));
  if (!title) return;
  const price_pence = Math.max(0, Math.round(parseFloat(priceRaw || "0") * 100)) || 0;

  const course = await Courses.create({
    academy_id: session.academyId!,
    created_by: session.userId,
    title,
    description,
    category: category || "General",
    price_pence,
    payment_url: parsePaymentUrl(formData.get("payment_url")).url,
    cover_emoji: emoji || "📘",
    course_type,
    level,
    study_hours,
  });

  revalidatePath(`/a/${slug}/instructor/courses`);
  revalidatePath(`/a/${slug}/admin/courses`);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  redirect(`/a/${slug}/${area}/courses/${course.id}`);
}

export async function updateCourse(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const id = String(formData.get("courseId") || "");
  const course = await Courses.byId(id);
  if (!course || course.academy_id !== session.academyId) return;

  const title = String(formData.get("title") || course.title);
  const description = String(formData.get("description") || course.description);
  const category = String(formData.get("category") || course.category);
  const priceRaw = formData.get("price");
  const price_pence = priceRaw !== null ? Math.max(0, Math.round(parseFloat(String(priceRaw) || "0") * 100)) : course.price_pence;
  // The payment link is the academy's own website / payment system. Empty clears it; something that isn't a valid https link keeps the old value.
  const pay = formData.has("payment_url") ? parsePaymentUrl(formData.get("payment_url")) : { url: course.payment_url, invalid: false };
  const payment_url = pay.invalid ? course.payment_url : pay.url;
  const is_published = formData.get("is_published") === "on";
  const emoji = String(formData.get("emoji") || course.cover_emoji);
  const certification_enabled = formData.get("certification_enabled") === "on";

  const course_type = formData.has("course_type") ? normalizeCourseType(formData.get("course_type")) : course.course_type;
  const level = formData.has("level") ? normalizeLevel(formData.get("level")) : course.level;
  const study_hours = formData.has("study_hours") ? normalizeHours(formData.get("study_hours")) : course.study_hours;

  await Courses.update(id, { title, description, category, price_pence, payment_url, is_published, cover_emoji: emoji, course_type, level, study_hours });
  await Courses.setCertificationEnabled(id, certification_enabled);
  revalidatePath(`/a/${slug}/instructor/courses/${id}`);
  revalidatePath(`/a/${slug}/admin/courses/${id}`);
  revalidatePath(`/a/${slug}/learner/catalog`);
}

// Switch one of the academy's three course types on or off. Off = hidden from
// learners and the public site (courses are kept; existing learners keep access).
export async function setCourseTypeEnabled(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const type = String(formData.get("type") || "");
  if (!isCourseType(type)) return;
  const academy = await Academies.byId(session.academyId!);
  if (!academy) return;
  const enabled = new Set(parseEnabledTypes(academy.enabled_course_types));
  if (formData.get("enabled") === "1") enabled.add(type);
  else enabled.delete(type);
  await Academies.setEnabledCourseTypes(academy.id, [...enabled]);
  revalidatePath(`/a/${slug}`);
  revalidatePath(`/a/${slug}/admin/courses`);
  revalidatePath(`/a/${slug}/instructor/courses`);
  revalidatePath(`/a/${slug}/learner/catalog`);
}

export async function deleteCourse(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const id = String(formData.get("courseId") || "");
  const course = await Courses.byId(id);
  if (!course || course.academy_id !== session.academyId) return;
  await Courses.remove(id);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/courses`);
  redirect(`/a/${slug}/${area}/courses`);
}

export async function assignModuleToCourse(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const courseId = String(formData.get("courseId") || "");
  const moduleId = String(formData.get("moduleId") || "");
  const [course, mod] = await Promise.all([Courses.byId(courseId), Modules.byId(moduleId)]);
  if (!course || !mod || course.academy_id !== session.academyId || mod.academy_id !== session.academyId) return;
  const existingCount = await Modules.countByCourse(courseId);
  await Modules.assignToCourse(courseId, moduleId, existingCount);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/courses/${courseId}`);
}

export async function unassignModuleFromCourse(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const courseId = String(formData.get("courseId") || "");
  const moduleId = String(formData.get("moduleId") || "");
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== session.academyId) return;
  await Modules.unassignFromCourse(courseId, moduleId);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/courses/${courseId}`);
}

export async function assignInstructorToCourse(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const courseId = String(formData.get("courseId") || "");
  const instructorId = String(formData.get("instructorId") || "");
  const course = await Courses.byId(courseId);
  const instructor = await Users.byId(instructorId);
  if (!course || course.academy_id !== session.academyId) return;
  if (!instructor || instructor.academy_id !== session.academyId || instructor.role !== "INSTRUCTOR") return;
  await CourseInstructors.assign(courseId, instructorId);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/courses/${courseId}`);
  revalidatePath(`/a/${slug}/admin/people`);
}

export async function unassignInstructorFromCourse(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const courseId = String(formData.get("courseId") || "");
  const instructorId = String(formData.get("instructorId") || "");
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== session.academyId) return;
  await CourseInstructors.unassign(courseId, instructorId);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/courses/${courseId}`);
  revalidatePath(`/a/${slug}/admin/people`);
}

type CoverState = { error?: string; success?: true } | undefined;
const COVER_MAX_BYTES = 3 * 1024 * 1024;

// Course cover image + "Estimated" time shown on the public course page.
export async function updateCourseCover(slug: string, _prev: CoverState, formData: FormData): Promise<CoverState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const id = String(formData.get("courseId") || "");
  const course = await Courses.byId(id);
  if (!course || course.academy_id !== session.academyId) return { error: "Course not found." };

  const estimated_time = String(formData.get("estimated_time") || "").trim().slice(0, 80);
  const file = formData.get("cover");
  const remove = formData.get("remove_cover") === "on";
  let newKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > COVER_MAX_BYTES) return { error: "That image is too large — please use one under 3MB." };
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = sniffImageExtension(buf);
    if (!ext) return { error: "The cover must be a PNG, JPG, GIF, WebP or SVG image." };
    newKey = `course-covers/${course.id}/${crypto.randomUUID()}.${ext}`;
    await saveFile(newKey, buf);
  }

  await Courses.setCoverDetails(id, { estimated_time, ...(newKey ? { cover_image_path: newKey } : remove ? { cover_image_path: null } : {}) });
  if ((newKey || remove) && course.cover_image_path) {
    try {
      await deleteFile(course.cover_image_path);
    } catch {
      /* an orphaned old image is harmless */
    }
  }
  revalidatePath(`/a/${slug}/instructor/courses/${id}`);
  revalidatePath(`/a/${slug}/admin/courses/${id}`);
  revalidatePath(`/a/${slug}/courses/${id}`);
  revalidatePath(`/a/${slug}`);
  return { success: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { Modules, Courses, Users, ModuleInstructors } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { saveFile, deleteFile } from "@/lib/storage";

export async function createModule(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const contentType = String(formData.get("content_type") || "TEXT") as "TEXT" | "URL" | "FILE" | "LIVE_SESSION";
  const courseId = String(formData.get("courseId") || "");
  if (!title) return;

  let content_text: string | null = null;
  let content_url: string | null = null;
  let file_path: string | null = null;
  let file_name: string | null = null;
  let file_mime: string | null = null;
  let file_size: number | null = null;
  let live_provider: "zoom" | "microsoft" | null = null;
  let live_join_url: string | null = null;
  let live_start_time: string | null = null;
  let live_duration_minutes: number | null = null;
  let live_password: string | null = null;

  if (contentType === "TEXT") {
    content_text = String(formData.get("content_text") || "");
  } else if (contentType === "URL") {
    content_url = String(formData.get("content_url") || "").trim();
  } else if (contentType === "FILE") {
    const file = formData.get("file") as File | null;
    if (file && file.size > 0) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storedName = `${crypto.randomUUID()}-${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await saveFile(storedName, buffer);
      file_path = storedName;
      file_name = file.name;
      file_mime = file.type || "application/octet-stream";
      file_size = file.size;
    }
  } else if (contentType === "LIVE_SESSION") {
    // The admin/instructor hosts this meeting from their own Zoom or
    // Microsoft Teams account and pastes the link here — no OAuth
    // connection or API call on our side (see modules.ts history for the
    // previous OAuth-based approach this replaced).
    const provider = String(formData.get("live_provider") || "") as "zoom" | "microsoft";
    const joinUrl = String(formData.get("live_join_url") || "").trim();
    const password = String(formData.get("live_password") || "").trim();
    const startLocal = String(formData.get("live_start_time") || "");
    const durationMinutes = Number(formData.get("live_duration_minutes") || 60);

    if (provider !== "zoom" && provider !== "microsoft") {
      throw new Error("Choose Zoom or Microsoft Teams for the live session.");
    }
    if (!joinUrl) {
      throw new Error("Paste the meeting link from your Zoom or Microsoft Teams account.");
    }
    let parsed: URL;
    try {
      parsed = new URL(joinUrl);
    } catch {
      throw new Error("That doesn't look like a valid meeting link — check the URL and try again.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("The meeting link must be a secure https:// link.");
    }

    live_provider = provider;
    live_join_url = joinUrl;
    live_password = password || null;
    live_start_time = startLocal ? new Date(startLocal).toISOString() : null;
    live_duration_minutes = durationMinutes;
  }

  const mod = await Modules.create({
    academy_id: session.academyId!,
    created_by: session.userId,
    title,
    description,
    content_type: contentType,
    content_text,
    content_url,
    file_path,
    file_name,
    file_mime,
    file_size,
    live_provider,
    live_join_url,
    live_start_time,
    live_duration_minutes,
    live_password,
  });

  if (courseId) {
    const course = await Courses.byId(courseId);
    if (course && course.academy_id === session.academyId) {
      const existing = await Modules.listByCourse(courseId);
      await Modules.assignToCourse(courseId, mod.id, existing.length);
    }
  }

  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/modules`);
  if (courseId) revalidatePath(`/a/${slug}/${area}/courses/${courseId}`);
}

export async function updateModule(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const id = String(formData.get("moduleId") || "");
  const mod = await Modules.byId(id);
  if (!mod || mod.academy_id !== session.academyId) return;

  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!title) throw new Error("Module title is required.");

  const patch: Parameters<typeof Modules.update>[1] = { title, description };

  if (mod.content_type === "TEXT") {
    patch.content_text = String(formData.get("content_text") || "");
  } else if (mod.content_type === "URL") {
    patch.content_url = String(formData.get("content_url") || "").trim();
  } else if (mod.content_type === "FILE") {
    const file = formData.get("file") as File | null;
    if (file && file.size > 0) {
      // Replacing the file — remove the old blob/local file so we don't
      // leave it orphaned in storage.
      if (mod.file_path) await deleteFile(mod.file_path);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storedName = `${crypto.randomUUID()}-${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await saveFile(storedName, buffer);
      patch.file_path = storedName;
      patch.file_name = file.name;
      patch.file_mime = file.type || "application/octet-stream";
      patch.file_size = file.size;
    }
    // No new file chosen — leave the existing one in place.
  } else if (mod.content_type === "LIVE_SESSION") {
    const provider = String(formData.get("live_provider") || "") as "zoom" | "microsoft";
    const joinUrl = String(formData.get("live_join_url") || "").trim();
    const password = String(formData.get("live_password") || "").trim();
    const startLocal = String(formData.get("live_start_time") || "");
    const durationMinutes = Number(formData.get("live_duration_minutes") || 60);

    if (provider !== "zoom" && provider !== "microsoft") {
      throw new Error("Choose Zoom or Microsoft Teams for the live session.");
    }
    if (!joinUrl) {
      throw new Error("Paste the meeting link from your Zoom or Microsoft Teams account.");
    }
    let parsed: URL;
    try {
      parsed = new URL(joinUrl);
    } catch {
      throw new Error("That doesn't look like a valid meeting link — check the URL and try again.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("The meeting link must be a secure https:// link.");
    }

    patch.live_provider = provider;
    patch.live_join_url = joinUrl;
    patch.live_password = password || null;
    patch.live_start_time = startLocal ? new Date(startLocal).toISOString() : null;
    patch.live_duration_minutes = durationMinutes;
  }
  // QUIZ modules already have a dedicated question builder
  // (/admin|instructor/quizzes/[moduleId]) and SCORM package files aren't
  // replaceable from this form — for both, only title/description change here.

  await Modules.update(id, patch);

  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/modules`);
}

export async function deleteModule(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const id = String(formData.get("moduleId") || "");
  const mod = await Modules.byId(id);
  if (!mod || mod.academy_id !== session.academyId) return;
  if (mod.file_path) {
    await deleteFile(mod.file_path);
  }
  await Modules.remove(id);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/modules`);
}

export async function assignInstructorToModule(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const moduleId = String(formData.get("moduleId") || "");
  const instructorId = String(formData.get("instructorId") || "");
  const mod = await Modules.byId(moduleId);
  const instructor = await Users.byId(instructorId);
  if (!mod || mod.academy_id !== session.academyId) return;
  if (!instructor || instructor.academy_id !== session.academyId || instructor.role !== "INSTRUCTOR") return;
  await ModuleInstructors.assign(moduleId, instructorId);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/modules`);
}

export async function unassignInstructorFromModule(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const moduleId = String(formData.get("moduleId") || "");
  const instructorId = String(formData.get("instructorId") || "");
  const mod = await Modules.byId(moduleId);
  if (!mod || mod.academy_id !== session.academyId) return;
  await ModuleInstructors.unassign(moduleId, instructorId);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/modules`);
}

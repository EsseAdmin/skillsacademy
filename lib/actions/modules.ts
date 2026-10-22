"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Modules, Courses, Users, ModuleInstructors } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { sniffImageExtension } from "@/lib/imageSniff";
import { saveFile, deleteFile } from "@/lib/storage";
import { safeHttpUrl } from "@/lib/safeUrl";
import { MAX_VIDEO_UPLOAD_BYTES } from "@/lib/videoModule";
import { purgeActivityFiles } from "@/lib/actions/activities";

function readVideoUrl(formData: FormData): string | null {
  const raw = String(formData.get("content_url") || "").trim();
  if (!raw) return null;
  const safe = safeHttpUrl(raw, { httpsOnly: true });
  if (!safe) throw new Error("That doesn't look like a valid https:// video link.");
  return safe;
}

function validateVideoFile(file: File) {
  const okType = file.type.startsWith("video/") || /\.(mp4|webm|ogg)$/i.test(file.name);
  if (!okType) throw new Error("Upload an MP4, WebM or OGG video file, or paste a YouTube/Vimeo link instead.");
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error("That video is too large to upload here (4MB max). Host it on YouTube or Vimeo and paste the link instead.");
  }
}

export async function createModule(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const contentType = String(formData.get("content_type") || "TEXT") as "TEXT" | "URL" | "FILE" | "VIDEO" | "LIVE_SESSION";
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
    const rawUrl = String(formData.get("content_url") || "").trim();
    if (rawUrl) {
      content_url = safeHttpUrl(rawUrl);
      if (!content_url) throw new Error("That doesn't look like a valid http(s) link.");
    }
  } else if (contentType === "VIDEO") {
    content_text = String(formData.get("content_text") || "").trim() || null;
    content_url = readVideoUrl(formData);
    const file = formData.get("file") as File | null;
    if (file && file.size > 0) {
      validateVideoFile(file);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storedName = `${crypto.randomUUID()}-${safeName}`;
      await saveFile(storedName, Buffer.from(await file.arrayBuffer()));
      file_path = storedName;
      file_name = file.name;
      file_mime = file.type || "video/mp4";
      file_size = file.size;
    }
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
  // Created from the activity picker's own screen: go back to the library.
  if (formData.get("return") === "1") {
    redirect(`/a/${slug}/${area}/modules?created=${encodeURIComponent(mod.id)}${courseId ? `&courseId=${encodeURIComponent(courseId)}` : ""}`);
  }
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
    const rawUrl = String(formData.get("content_url") || "").trim();
    if (rawUrl) {
      const safe = safeHttpUrl(rawUrl);
      if (!safe) throw new Error("That doesn't look like a valid http(s) link.");
      patch.content_url = safe;
    } else {
      patch.content_url = "";
    }
  } else if (mod.content_type === "VIDEO") {
    patch.content_text = String(formData.get("content_text") || "").trim() || null;
    patch.content_url = readVideoUrl(formData);
    const file = formData.get("file") as File | null;
    if (file && file.size > 0) {
      validateVideoFile(file);
      if (mod.file_path) await deleteFile(mod.file_path);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storedName = `${crypto.randomUUID()}-${safeName}`;
      await saveFile(storedName, Buffer.from(await file.arrayBuffer()));
      patch.file_path = storedName;
      patch.file_name = file.name;
      patch.file_mime = file.type || "video/mp4";
      patch.file_size = file.size;
    } else if (formData.get("removeFile") === "on" && mod.file_path) {
      await deleteFile(mod.file_path);
      patch.file_path = null;
      patch.file_name = null;
      patch.file_mime = null;
      patch.file_size = null;
    }
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
  if (mod.image_path) {
    try {
      await deleteFile(mod.image_path);
    } catch {
      /* an orphaned picture is harmless */
    }
  }
  await purgeActivityFiles(mod); // folder files and assignment hand-ins
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

type ImageState = { error?: string; success?: true } | undefined;
const MODULE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

// Replaces or removes a module's picture (shown on the course page and in the learner's course view).
export async function updateModuleImage(slug: string, _prev: ImageState, formData: FormData): Promise<ImageState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const id = String(formData.get("moduleId") || "");
  const mod = await Modules.byId(id);
  if (!mod || mod.academy_id !== session.academyId) return { error: "Module not found." };

  const file = formData.get("image");
  const remove = formData.get("remove_image") === "on";
  let newKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MODULE_IMAGE_MAX_BYTES) return { error: "That image is too large — please use one under 3MB." };
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = sniffImageExtension(buf);
    if (!ext) return { error: "The picture must be a PNG, JPG, GIF, WebP or SVG image." };
    newKey = `module-images/${mod.id}/${crypto.randomUUID()}.${ext}`;
    await saveFile(newKey, buf);
  } else if (!remove) {
    return { error: "Choose a picture to upload, or tick the box to go back to the default picture." };
  }

  await Modules.setImage(id, newKey);
  if (mod.image_path) {
    try {
      await deleteFile(mod.image_path);
    } catch {
      /* an orphaned old picture is harmless */
    }
  }
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/modules`);
  revalidatePath(`/a/${slug}/${area}/courses`, "layout");
  revalidatePath(`/a/${slug}/courses`, "layout");
  revalidatePath(`/a/${slug}/learner/courses`, "layout");
  return { success: true };
}

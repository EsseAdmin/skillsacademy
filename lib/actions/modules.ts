"use server";

import { revalidatePath } from "next/cache";
import { Modules, Courses, Users, ModuleInstructors } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { saveFile, deleteFile } from "@/lib/storage";
import { getValidAccessToken } from "@/lib/integrations/tokens";
import { createZoomMeeting } from "@/lib/integrations/zoom";
import { createTeamsMeeting } from "@/lib/integrations/microsoft";

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
  let live_meeting_id: string | null = null;
  let live_join_url: string | null = null;
  let live_start_url: string | null = null;
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
    const provider = String(formData.get("live_provider") || "") as "zoom" | "microsoft";
    const startLocal = String(formData.get("live_start_time") || "");
    const durationMinutes = Number(formData.get("live_duration_minutes") || 60);
    const startIso = startLocal ? new Date(startLocal).toISOString() : null;

    const accessToken = await getValidAccessToken(session.academyId!, provider);
    if (!accessToken) {
      throw new Error(`${provider === "zoom" ? "Zoom" : "Microsoft Teams"} isn't connected for this academy yet.`);
    }

    if (provider === "zoom") {
      const meeting = await createZoomMeeting(accessToken, {
        topic: title,
        startTimeIso: startIso,
        durationMinutes,
      });
      live_provider = "zoom";
      live_meeting_id = meeting.id;
      live_join_url = meeting.join_url;
      live_start_url = meeting.start_url;
      live_password = meeting.password;
    } else {
      const start = startIso ?? new Date().toISOString();
      const end = new Date(new Date(start).getTime() + durationMinutes * 60 * 1000).toISOString();
      const meeting = await createTeamsMeeting(accessToken, {
        subject: title,
        startDateTimeIso: start,
        endDateTimeIso: end,
      });
      live_provider = "microsoft";
      live_meeting_id = meeting.id;
      live_join_url = meeting.joinWebUrl;
      live_start_url = meeting.joinWebUrl; // Teams has no separate host-only URL
    }
    live_start_time = startIso;
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
    live_meeting_id,
    live_join_url,
    live_start_url,
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

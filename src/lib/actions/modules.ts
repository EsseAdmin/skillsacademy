"use server";

import { revalidatePath } from "next/cache";
import { Modules, Courses, Users, ModuleInstructors } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { saveFile, deleteFile } from "@/lib/storage";

export async function createModule(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const contentType = String(formData.get("content_type") || "TEXT") as "TEXT" | "URL" | "FILE";
  const courseId = String(formData.get("courseId") || "");
  if (!title) return;

  let content_text: string | null = null;
  let content_url: string | null = null;
  let file_path: string | null = null;
  let file_name: string | null = null;
  let file_mime: string | null = null;
  let file_size: number | null = null;

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

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Modules, Courses, ScormPackages } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { deleteFile } from "@/lib/storage";
import { readScormZip, storeScormPackage } from "@/lib/scorm/install";

export async function uploadScormPackage(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const courseId = String(formData.get("courseId") || "") || null;
  const file = formData.get("file") as File | null;

  if (!title) throw new Error("Title is required.");
  if (!file || file.size === 0) throw new Error("Choose a SCORM .zip package to upload.");

  // Fail on a bad zip before creating any module row.
  const read = await readScormZip(Buffer.from(await file.arrayBuffer()));

  const mod = await Modules.create({
    academy_id: session.academyId!,
    created_by: session.userId,
    title,
    description,
    content_type: "SCORM",
  });

  await storeScormPackage({ read, moduleId: mod.id, academyId: session.academyId!, fallbackTitle: title });

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
  redirect(`/a/${slug}/${area}/modules${courseId ? `?courseId=${courseId}` : ""}`);
}

export async function deleteScormModule(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const moduleId = String(formData.get("moduleId") || "");
  const mod = await Modules.byId(moduleId);
  if (!mod || mod.academy_id !== session.academyId || mod.content_type !== "SCORM") return;
  const pkg = await ScormPackages.byModule(moduleId);
  if (pkg) {
    // Best-effort cleanup — individual blob deletes aren't batched, but this
    // isn't on a hot path and package files are typically modest in count.
    await deleteFile(`${pkg.storage_prefix}/${pkg.launch_path}`).catch(() => {});
  }
  await Modules.remove(moduleId);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/modules`);
}

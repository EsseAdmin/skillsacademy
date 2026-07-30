"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import JSZip from "jszip";
import { Modules, Courses, ScormPackages } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { saveFile, deleteFile } from "@/lib/storage";
import { parseScormManifest } from "@/lib/scorm/manifest";

export async function uploadScormPackage(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const courseId = String(formData.get("courseId") || "") || null;
  const file = formData.get("file") as File | null;

  if (!title) throw new Error("Title is required.");
  if (!file || file.size === 0) throw new Error("Choose a SCORM .zip package to upload.");

  const zipBuffer = Buffer.from(await file.arrayBuffer());
  const zip = await JSZip.loadAsync(zipBuffer);

  const manifestEntry = zip.file(/imsmanifest\.xml$/i)[0];
  if (!manifestEntry) {
    throw new Error("This doesn't look like a SCORM package — no imsmanifest.xml was found in the .zip.");
  }
  const manifestXml = await manifestEntry.async("string");
  const parsed = parseScormManifest(manifestXml);

  // The manifest may live in a subfolder inside the zip (some export tools
  // wrap the package in an extra folder) — resolve every other path
  // relative to wherever imsmanifest.xml actually sits.
  const manifestDir = manifestEntry.name.includes("/") ? manifestEntry.name.slice(0, manifestEntry.name.lastIndexOf("/") + 1) : "";

  const mod = await Modules.create({
    academy_id: session.academyId!,
    created_by: session.userId,
    title,
    description,
    content_type: "SCORM",
  });

  const storagePrefix = `scorm/${mod.id}`;
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const entry of entries) {
    const buffer = await entry.async("nodebuffer");
    // Store paths relative to the manifest directory so launch_path (also
    // manifest-relative) resolves directly against storagePrefix.
    const relativePath = entry.name.startsWith(manifestDir) ? entry.name.slice(manifestDir.length) : entry.name;
    if (!relativePath) continue;
    await saveFile(`${storagePrefix}/${relativePath}`, buffer);
  }

  await ScormPackages.create({
    module_id: mod.id,
    academy_id: session.academyId!,
    version: parsed.version,
    title: parsed.title || title,
    launch_path: parsed.launchHref,
    storage_prefix: storagePrefix,
    manifest_identifier: parsed.identifier,
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

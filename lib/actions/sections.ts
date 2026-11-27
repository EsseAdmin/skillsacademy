"use server";

// Sections inside a "Module with sections": create the module (with its three default sections), rename / add /
// reorder / delete sections, and move or remove the activities and resources inside them.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Courses, Modules, ModuleItems, ModuleSections, type ModuleRow } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { staffModule } from "@/lib/moduleAccess";
import { sectionsEditorPath, staffSection } from "@/lib/moduleSections";
import { removeModuleCompletely } from "@/lib/moduleCleanup";
import type { SessionPayload } from "@/lib/auth";

const area = (s: SessionPayload): "admin" | "instructor" => (s.role === "ACADEMY_ADMIN" ? "admin" : "instructor");
const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function refresh(slug: string, session: SessionPayload, containerId: string) {
  revalidatePath(sectionsEditorPath(slug, area(session), containerId));
  revalidatePath(`/a/${slug}/${area(session)}/modules`);
  revalidatePath(`/a/${slug}/learner`, "layout");
}

/** Creates a module with the three default sections (and adds it to a course when asked), then opens its sections screen. */
export async function createSectionedModule(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const title = clean(formData.get("title"), 200);
  const description = clean(formData.get("description"), 400);
  const courseId = String(formData.get("courseId") || "");
  const a = area(session);
  if (!title) redirect(`/a/${slug}/${a}/modules/new?type=SECTIONS${courseId ? `&courseId=${encodeURIComponent(courseId)}` : ""}&error=${encodeURIComponent("Give the module a title.")}`);
  const mod = await Modules.create({ academy_id: session.academyId!, created_by: session.userId, title, description, content_type: "SECTIONS" });
  await ModuleSections.createDefaults(mod.id);
  if (courseId) {
    const course = await Courses.byId(courseId);
    if (course && course.academy_id === session.academyId) await Modules.assignToCourse(courseId, mod.id, await Modules.countByCourse(courseId));
    revalidatePath(`/a/${slug}/${a}/courses/${courseId}`);
  }
  revalidatePath(`/a/${slug}/${a}/modules`);
  redirect(sectionsEditorPath(slug, a, mod.id));
}

async function container(session: SessionPayload, formData: FormData): Promise<ModuleRow | undefined> {
  const mod = await staffModule(session, String(formData.get("moduleId") || ""));
  return mod && mod.content_type === "SECTIONS" ? mod : undefined;
}

export async function addSection(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const mod = await container(session, formData);
  if (!mod) return;
  const title = clean(formData.get("title"), 120) || "New section";
  await ModuleSections.create(mod.id, title);
  refresh(slug, session, mod.id);
}

export async function renameSection(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const found = await staffSection(session, String(formData.get("sectionId") || ""));
  const title = clean(formData.get("title"), 120);
  if (!found || !title) return;
  await ModuleSections.rename(found.section.id, title);
  refresh(slug, session, found.container.id);
}

export async function moveSection(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const found = await staffSection(session, String(formData.get("sectionId") || ""));
  if (!found) return;
  await ModuleSections.move(found.section.id, formData.get("direction") === "up" ? "up" : "down");
  refresh(slug, session, found.container.id);
}

/** Deletes a section and everything in it (the activities and resources are removed too, with their files). */
export async function deleteSection(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const found = await staffSection(session, String(formData.get("sectionId") || ""));
  if (!found) return;
  const items = await ModuleItems.listByParent(found.container.id);
  for (const it of items.filter((i) => i.section_id === found.section.id)) await removeModuleCompletely(it);
  await ModuleSections.remove(found.section.id);
  refresh(slug, session, found.container.id);
}

async function itemFor(session: SessionPayload, formData: FormData): Promise<ModuleRow | undefined> {
  const it = await staffModule(session, String(formData.get("itemId") || ""));
  return it && it.parent_module_id && it.section_id ? it : undefined;
}

export async function moveItem(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const it = await itemFor(session, formData);
  if (!it) return;
  await ModuleItems.move(it.id, formData.get("direction") === "up" ? "up" : "down");
  refresh(slug, session, it.parent_module_id!);
}

export async function moveItemToSection(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const it = await itemFor(session, formData);
  const target = await staffSection(session, String(formData.get("sectionId") || ""));
  // Only within the same module: an item never moves to another module's section.
  if (!it || !target || target.container.id !== it.parent_module_id) return;
  await ModuleItems.moveToSection(it.id, target.section.id);
  refresh(slug, session, it.parent_module_id!);
}

export async function removeItem(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const it = await itemFor(session, formData);
  if (!it) return;
  await removeModuleCompletely(it);
  refresh(slug, session, it.parent_module_id!);
}

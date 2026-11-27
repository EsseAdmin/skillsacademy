// Staff-side helpers for "Module with sections": resolving a section the caller may manage, and placing a newly
// created activity or resource inside it. The module that holds the section is checked with staffModule(), so
// another academy's section (or an instructor's colleague's module) is treated as if it didn't exist.
import { ModuleItems, ModuleSections, type ModuleRow, type ModuleSection } from "@/lib/queries";
import { staffModule } from "@/lib/moduleAccess";
import type { SessionPayload } from "@/lib/auth";

export function sectionsEditorPath(slug: string, area: "admin" | "instructor", containerId: string): string {
  return `/a/${slug}/${area}/sections/${containerId}`;
}

/** The section and its module, if this admin/instructor may manage that module. */
export async function staffSection(session: SessionPayload, sectionId: string): Promise<{ section: ModuleSection; container: ModuleRow } | undefined> {
  if (!sectionId) return undefined;
  const section = await ModuleSections.byId(sectionId);
  if (!section) return undefined;
  const container = await staffModule(session, section.module_id);
  if (!container || container.content_type !== "SECTIONS") return undefined;
  return { section, container };
}

/** Puts a just-created module into a section; returns the module that holds it, or null if there was no (valid) section. */
export async function placeInSection(session: SessionPayload, moduleId: string, sectionId: string | null | undefined): Promise<ModuleRow | null> {
  if (!sectionId) return null;
  const found = await staffSection(session, sectionId);
  if (!found) return null;
  await ModuleItems.place(moduleId, found.container.id, found.section.id);
  return found.container;
}

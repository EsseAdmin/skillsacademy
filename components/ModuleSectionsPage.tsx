import Link from "next/link";
import { redirect } from "next/navigation";
import { Academies, Templates, ModuleItems, ModuleSections, type ModuleRow } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell, { type NavItem } from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import ActivityPicker from "@/components/ActivityPicker";
import ModuleEditForm from "@/components/ModuleEditForm";
import { ModuleFiles } from "@/lib/activityQueries";
import { ACTIVITY_ICON, ACTIVITY_LABEL } from "@/lib/activities";
import { staffModule } from "@/lib/moduleAccess";
import { updateModule } from "@/lib/actions/modules";
import { updateActivity } from "@/lib/actions/activities";
import { addSection, renameSection, moveSection, deleteSection, moveItem, moveItemToSection, removeItem } from "@/lib/actions/sections";
import type { SessionPayload } from "@/lib/auth";

const btn = "block w-full px-3 py-1.5 text-left text-xs text-gray-800 hover:bg-gray-50";

// The staff screen for one "Module with sections": rename, add, reorder and delete sections, and add / edit / move /
// remove the activities and resources inside each one.
export default async function ModuleSectionsPage({
  slug, area, session, navItems, moduleId, saved,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  moduleId: string;
  saved?: string;
}) {
  const container = await staffModule(session, moduleId);
  if (!container || container.content_type !== "SECTIONS") redirect(`/a/${slug}/${area}/modules`);

  const academy = (await Academies.bySlug(slug))!;
  const [template, sections, items] = await Promise.all([
    Templates.byId(academy.template_id).then((t) => t!),
    ModuleSections.listByModule(container.id),
    ModuleItems.listByParent(container.id),
  ]);
  const folderFiles = await ModuleFiles.listByModules(items.filter((i) => i.content_type === "FOLDER").map((i) => i.id));
  const bySection = new Map<string, ModuleRow[]>();
  for (const it of items) bySection.set(it.section_id ?? "", [...(bySection.get(it.section_id ?? "") ?? []), it]);

  const bAddSection = addSection.bind(null, slug);
  const bRename = renameSection.bind(null, slug);
  const bMoveSection = moveSection.bind(null, slug);
  const bDeleteSection = deleteSection.bind(null, slug);
  const bMoveItem = moveItem.bind(null, slug);
  const bMoveToSection = moveItemToSection.bind(null, slug);
  const bRemoveItem = removeItem.bind(null, slug);
  const bUpdate = updateModule.bind(null, slug);
  const bUpdateActivity = updateActivity.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={area === "admin" ? "Academy Admin" : "Instructor"}
      themeStyle={themeVars(template)}
      navItems={navItems}
      activeHref={`/a/${slug}/${area}/modules`}
      userName={session.name}
      userRoleLabel={area === "admin" ? "Academy Admin" : "Instructor"}
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={area === "admin"} />}
    >
      <Link href={`/a/${slug}/${area}/modules`} className="text-sm app-link mb-4 inline-block">← Module library</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" data-testid="sections-module-title">🗂️ {container.title}</h1>
      <p className="text-gray-700 text-sm mb-6 max-w-3xl">
        {container.description ? `${container.description} ` : ""}
        Each section holds activities and resources for this module. Rename a section with the pencil, add your own sections, and use
        &ldquo;Add an activity or resource&rdquo; inside a section to create its content.
      </p>
      {saved && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Saved.</div>}

      <div className="grid gap-6 max-w-5xl" data-testid="sections-list">
        {sections.map((s, si) => {
          const list = bySection.get(s.id) ?? [];
          return (
            <section key={s.id} className="app-card overflow-hidden" data-testid="module-section" data-section-title={s.title}>
              <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                <h2 className="text-xl font-bold text-gray-800" data-testid="section-title">{s.title}</h2>
                <span className="text-xs text-gray-500">{list.length} item{list.length === 1 ? "" : "s"}</span>
                <div className="ml-auto flex items-center gap-2">
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-sm hover:bg-gray-100" aria-label={`Rename ${s.title}`} data-testid="rename-section">✏️ Rename</summary>
                    <form action={bRename} className="absolute right-0 z-10 mt-1 flex w-72 gap-2 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
                      <input type="hidden" name="sectionId" value={s.id} />
                      <input name="title" defaultValue={s.title} required maxLength={120} aria-label="Section heading" className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
                      <button type="submit" className="rounded-md px-3 py-1.5 text-xs font-semibold app-btn-primary">Save</button>
                    </form>
                  </details>
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-md border border-gray-200 bg-white px-2.5 py-1 text-sm shadow-sm hover:bg-gray-50" aria-label={`Section menu for ${s.title}`}>⋮</summary>
                    <div className="absolute right-0 z-10 mt-1 w-52 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                      {si > 0 && (
                        <form action={bMoveSection}>
                          <input type="hidden" name="sectionId" value={s.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button type="submit" className={btn}>↑ Move section up</button>
                        </form>
                      )}
                      {si < sections.length - 1 && (
                        <form action={bMoveSection}>
                          <input type="hidden" name="sectionId" value={s.id} />
                          <input type="hidden" name="direction" value="down" />
                          <button type="submit" className={btn}>↓ Move section down</button>
                        </form>
                      )}
                      <form action={bDeleteSection}>
                        <input type="hidden" name="sectionId" value={s.id} />
                        <button type="submit" className={`${btn} text-red-700`} data-testid="delete-section">🗑 Delete section{list.length ? ` and its ${list.length} item${list.length === 1 ? "" : "s"}` : ""}</button>
                      </form>
                    </div>
                  </details>
                </div>
              </div>

                <div className="border-t border-dashed border-gray-300">
                  {list.map((it, ii) => (
                    <div key={it.id} className="border-b border-dashed border-gray-300 px-5 py-4" data-testid="section-item" data-item-title={it.title}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl" aria-hidden>{ACTIVITY_ICON[it.content_type]}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-900 break-words">{it.title}</div>
                          <div className="text-xs text-gray-500">
                            {ACTIVITY_LABEL[it.content_type] ?? it.content_type}
                            {it.content_type === "FILE" && it.file_name ? ` · ${it.file_name}` : ""}
                            {it.content_type === "URL" && it.content_url ? ` · ${it.content_url}` : ""}
                          </div>
                        </div>
                        {it.content_type === "QUIZ" && <Link href={`/a/${slug}/${area}/quizzes/${it.id}`} className="app-link text-xs font-semibold">Manage questions</Link>}
                        {["ASSIGNMENT", "FORUM", "CHOICE"].includes(it.content_type) && (
                          <Link href={`/a/${slug}/${area}/activities/${it.id}`} className="app-link text-xs font-semibold">
                            {it.content_type === "ASSIGNMENT" ? "Grade" : it.content_type === "FORUM" ? "Moderate" : "Results"}
                          </Link>
                        )}
                        <details className="relative">
                          <summary className="cursor-pointer list-none rounded-md border border-gray-200 bg-white px-2.5 py-1 text-sm shadow-sm hover:bg-gray-50" aria-label={`Menu for ${it.title}`}>⋮</summary>
                          <div className="absolute right-0 z-10 mt-1 w-52 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                            {ii > 0 && (
                              <form action={bMoveItem}>
                                <input type="hidden" name="itemId" value={it.id} />
                                <input type="hidden" name="direction" value="up" />
                                <button type="submit" className={btn}>↑ Move up</button>
                              </form>
                            )}
                            {ii < list.length - 1 && (
                              <form action={bMoveItem}>
                                <input type="hidden" name="itemId" value={it.id} />
                                <input type="hidden" name="direction" value="down" />
                                <button type="submit" className={btn}>↓ Move down</button>
                              </form>
                            )}
                            {sections.length > 1 && (
                              <form action={bMoveToSection} className="flex gap-1 px-3 py-1.5">
                                <input type="hidden" name="itemId" value={it.id} />
                                <select name="sectionId" aria-label="Move to section" className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1 text-xs text-gray-900" defaultValue="">
                                  <option value="" disabled>Move to…</option>
                                  {sections.filter((o) => o.id !== s.id).map((o) => (
                                    <option key={o.id} value={o.id}>{o.title}</option>
                                  ))}
                                </select>
                                <button type="submit" className="rounded border border-gray-300 px-2 text-xs">Go</button>
                              </form>
                            )}
                            <form action={bRemoveItem}>
                              <input type="hidden" name="itemId" value={it.id} />
                              <button type="submit" className={`${btn} text-red-700`} data-testid="remove-item">🗑 Delete</button>
                            </form>
                          </div>
                        </details>
                      </div>
                      <details className="mt-1">
                        <summary className="cursor-pointer list-none text-xs font-semibold app-link select-none" data-testid="edit-item">✏️ Edit details</summary>
                        <ModuleEditForm action={bUpdate} activityAction={bUpdateActivity} mod={it} folderFiles={folderFiles.get(it.id) ?? []} />
                      </details>
                    </div>
                  ))}
                  {list.length === 0 && <p className="px-5 py-4 text-sm text-gray-500">Nothing here yet.</p>}
                  <div className="flex justify-center px-5 py-4">
                    <ActivityPicker slug={slug} area={area} sectionId={s.id} compact />
                  </div>
                </div>
            </section>
          );
        })}
        {sections.length === 0 && <p className="text-sm text-gray-600">This module has no sections yet. Add one below.</p>}

        <form action={bAddSection} className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-gray-300 p-4" data-testid="add-section-form">
          <input type="hidden" name="moduleId" value={container.id} />
          <label className="grid gap-1.5 text-xs font-semibold text-gray-700">
            New section heading
            <input name="title" required maxLength={120} placeholder="e.g. Case studies" className="w-72 max-w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
          </label>
          <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">+ Add a section</button>
        </form>
      </div>
    </PortalShell>
  );
}

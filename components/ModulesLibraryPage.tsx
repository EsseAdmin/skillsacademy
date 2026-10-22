import Link from "next/link";
import { Academies, Templates, Modules, Users, ModuleInstructors } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import ActivityPicker from "@/components/ActivityPicker";
import ModuleEditForm from "@/components/ModuleEditForm";
import ModuleImageForm from "@/components/ModuleImageForm";
import ModuleThumb from "@/components/ModuleThumb";
import { ModuleFiles } from "@/lib/activityQueries";
import { ACTIVITY_ICON, ACTIVITY_LABEL, readChoice } from "@/lib/activities";
import {
  updateModule,
  deleteModule,
  assignInstructorToModule,
  unassignInstructorFromModule,
  updateModuleImage,
} from "@/lib/actions/modules";
import { updateActivity } from "@/lib/actions/activities";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

const CONTENT_ICON = ACTIVITY_ICON;

export default async function ModulesLibraryPage({
  slug,
  area,
  session,
  navItems,
  courseId,
  notice,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  courseId?: string;
  notice?: { created?: string; saved?: string; error?: string };
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const modules = await Modules.listByAcademy(academy.id);
  const allInstructors = await Users.listByAcademy(academy.id, "INSTRUCTOR");

  const modulesWithInstructors = await Promise.all(
    modules.map(async (m) => {
      const folderFiles = m.content_type === "FOLDER" ? await ModuleFiles.listByModule(m.id) : [];
      const assigned = await ModuleInstructors.listByModule(m.id);
      const assignedIds = new Set(assigned.map((i) => i.id));
      const available = allInstructors.filter((i) => !assignedIds.has(i.id));
      return { ...m, assigned, available, folderFiles };
    })
  );

    const boundUpdate = updateModule.bind(null, slug);
  const boundUpdateActivity = updateActivity.bind(null, slug);
  const boundImage = updateModuleImage.bind(null, slug);
  const artColors = { primary: template.primary_color, secondary: template.secondary_color, accent: template.accent_color };
  const boundDelete = deleteModule.bind(null, slug);
  const boundAssignInstructor = assignInstructorToModule.bind(null, slug);
  const boundUnassignInstructor = unassignInstructorFromModule.bind(null, slug);

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
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Module Library</h1>
      <p className="text-gray-500 text-sm mb-8">
        Create reusable activities and resources, then assign them to any course.
      </p>

      {notice?.error && <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">{notice.error}</div>}
      {(notice?.created || notice?.saved) && (
        <div role="status" className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
          {notice.created ? "✅ Added to the library." : "✅ Changes saved."}
        </div>
      )}

      <div className="app-card p-6 mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">{courseId ? "Add to this course" : "Add content"}</h2>
          <p className="text-sm text-gray-700 mt-1">
            Pick from pages, books, folders, files, links, assignments, polls, forums, glossaries, lessons, quizzes and more.
            {courseId ? " New items are added to this course." : ""}
          </p>
        </div>
        <ActivityPicker slug={slug} area={area} courseId={courseId} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {modulesWithInstructors.map((m) => {
          const { assigned, available } = m;
          return (
            <div key={m.id} className="app-card p-5">
              <div className="flex items-start justify-between gap-3">
                <ModuleThumb mod={m} colors={artColors} className="w-20 h-[3.1rem]" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <span>{CONTENT_ICON[m.content_type]}</span> {m.title}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{m.description}</div>
                </div>
                <form action={boundDelete}>
                  <input type="hidden" name="moduleId" value={m.id} />
                  <button type="submit" className="text-xs text-gray-400 hover:text-red-600">
                    Delete
                  </button>
                </form>
              </div>
              <div className="mt-3 text-sm">
                {m.content_type === "TEXT" && <p className="text-gray-600 line-clamp-2">{m.content_text}</p>}
                {m.content_type === "URL" &&
                  (m.content_url ? (
                    <a href={m.content_url} target="_blank" rel="noreferrer" className="app-link break-all">
                      {m.content_url}
                    </a>
                  ) : (
                    <span className="text-gray-500">No link added yet — open Edit content to paste one</span>
                  ))}
                {m.content_type === "FILE" && (
                  <a href={`/api/files/${m.id}`} className="app-link">
                    📥 {m.file_name}
                  </a>
                )}
                {m.content_type === "VIDEO" && (
                  <span className="text-gray-600">
                    {m.file_path ? `🎬 Uploaded video: ${m.file_name}` : m.content_url ? `🎬 ${m.content_url}` : "🎬 No video added yet — open Edit content to add one"}
                  </span>
                )}
                {m.content_type === "LIVE_SESSION" && (
                  <div className="text-gray-600">
                    <span className="capitalize">{m.live_provider}</span> meeting
                    {m.live_start_time && ` · ${new Date(m.live_start_time).toLocaleString()}`}
                    {m.live_start_url && (
                      <>
                        {" · "}
                        <a href={m.live_start_url} target="_blank" rel="noreferrer" className="app-link">
                          Start as host ↗
                        </a>
                      </>
                    )}
                  </div>
                )}
                {m.content_type === "QUIZ" && (
                  <Link href={`/a/${slug}/${area}/quizzes/${m.id}`} className="app-link">
                    🧪 Manage quiz questions
                  </Link>
                )}
                {m.content_type === "SCORM" && <span className="text-gray-500">📦 SCORM package</span>}
                {["PAGE", "BOOK", "FOLDER", "MEDIA", "GLOSSARY", "LESSON", "CHOICE", "ASSIGNMENT", "FORUM"].includes(m.content_type) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-700">
                    <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5">{ACTIVITY_LABEL[m.content_type]}</span>
                    {m.content_type === "FOLDER" && <span>{m.folderFiles.length} file{m.folderFiles.length === 1 ? "" : "s"}</span>}
                    {m.content_type === "CHOICE" && <span>{readChoice(m.config_json).question}</span>}
                    {["ASSIGNMENT", "FORUM", "CHOICE"].includes(m.content_type) && (
                      <Link href={`/a/${slug}/${area}/activities/${m.id}`} className="app-link font-semibold">
                        {m.content_type === "ASSIGNMENT" ? "View & grade submissions" : m.content_type === "FORUM" ? "Open forum & moderate" : "See results"}
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <details className="mt-3 group">
                <summary className="text-xs font-semibold app-link cursor-pointer select-none list-none">
                  ✏️ Edit content
                </summary>
                <ModuleEditForm action={boundUpdate} activityAction={boundUpdateActivity} mod={m} folderFiles={m.folderFiles} />
                <ModuleImageForm action={boundImage} moduleId={m.id} hasImage={!!m.image_path} version={m.updated_at} />
              </details>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-600 mb-2">
                  Assigned instructors {assigned.length > 0 && `(${assigned.length})`}
                </div>
                {assigned.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {assigned.map((ins) => (
                      <form action={boundUnassignInstructor} key={ins.id} className="inline-flex">
                        <input type="hidden" name="moduleId" value={m.id} />
                        <input type="hidden" name="instructorId" value={ins.id} />
                        <button
                          type="submit"
                          title="Remove"
                          className="text-xs bg-gray-100 text-gray-700 rounded-full px-3 py-1 hover:bg-red-50 hover:text-red-600"
                        >
                          {ins.name} ×
                        </button>
                      </form>
                    ))}
                  </div>
                )}
                {available.length > 0 ? (
                  <form action={boundAssignInstructor} className="flex gap-2">
                    <input type="hidden" name="moduleId" value={m.id} />
                    <select name="instructorId" className="rounded-md border border-gray-300 px-2 py-1.5 text-xs flex-1">
                      {available.map((ins) => (
                        <option key={ins.id} value={ins.id}>
                          {ins.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-semibold rounded-md px-3 py-1.5 border border-gray-300 hover:bg-gray-50">
                      Assign
                    </button>
                  </form>
                ) : (
                  allInstructors.length === 0 && <p className="text-xs text-gray-400">No instructors in this academy yet.</p>
                )}
              </div>
            </div>
          );
        })}
        {modulesWithInstructors.length === 0 && <p className="text-sm text-gray-500">No modules yet — create one above.</p>}
      </div>
    </PortalShell>
  );
}

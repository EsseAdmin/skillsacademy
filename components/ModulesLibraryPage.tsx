import Link from "next/link";
import { Academies, Templates, Modules, Users, ModuleInstructors } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import ModuleForm from "@/components/ModuleForm";
import ModuleEditForm from "@/components/ModuleEditForm";
import {
  createModule,
  updateModule,
  deleteModule,
  assignInstructorToModule,
  unassignInstructorFromModule,
} from "@/lib/actions/modules";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

const CONTENT_ICON: Record<string, string> = { TEXT: "📝", URL: "🔗", FILE: "📎", LIVE_SESSION: "🎥", QUIZ: "🧪", SCORM: "📦" };

export default async function ModulesLibraryPage({
  slug,
  area,
  session,
  navItems,
  courseId,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  courseId?: string;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const modules = await Modules.listByAcademy(academy.id);
  const allInstructors = await Users.listByAcademy(academy.id, "INSTRUCTOR");

  const modulesWithInstructors = await Promise.all(
    modules.map(async (m) => {
      const assigned = await ModuleInstructors.listByModule(m.id);
      const assignedIds = new Set(assigned.map((i) => i.id));
      const available = allInstructors.filter((i) => !assignedIds.has(i.id));
      return { ...m, assigned, available };
    })
  );

  const boundCreate = createModule.bind(null, slug);
  const boundUpdate = updateModule.bind(null, slug);
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
        Create reusable content modules — text, links, or uploaded files — then assign them to any course.
      </p>

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">
          {courseId ? "New module (will be added to this course)" : "Create a new module"}
        </h2>
        <ModuleForm action={boundCreate} courseId={courseId} />
        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-3">
          <Link
            href={`/a/${slug}/${area}/quizzes/new${courseId ? `?courseId=${courseId}` : ""}`}
            className="text-sm font-semibold rounded-md px-4 py-2 border border-gray-300 hover:bg-gray-50"
          >
            🧪 Build a Quiz instead
          </Link>
          <Link
            href={`/a/${slug}/${area}/scorm/new${courseId ? `?courseId=${courseId}` : ""}`}
            className="text-sm font-semibold rounded-md px-4 py-2 border border-gray-300 hover:bg-gray-50"
          >
            📦 Upload a SCORM Package instead
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {modulesWithInstructors.map((m) => {
          const { assigned, available } = m;
          return (
            <div key={m.id} className="app-card p-5">
              <div className="flex items-start justify-between">
                <div>
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
                {m.content_type === "URL" && (
                  <a href={m.content_url || "#"} target="_blank" rel="noreferrer" className="app-link break-all">
                    {m.content_url}
                  </a>
                )}
                {m.content_type === "FILE" && (
                  <a href={`/api/files/${m.id}`} className="app-link">
                    📥 {m.file_name}
                  </a>
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
              </div>

              <details className="mt-3 group">
                <summary className="text-xs font-semibold app-link cursor-pointer select-none list-none">
                  ✏️ Edit content
                </summary>
                <ModuleEditForm action={boundUpdate} mod={m} />
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

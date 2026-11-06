import { setCourseTypeEnabled } from "@/lib/actions/courses";
import { COURSE_TYPES, COURSE_TYPE_LABEL, COURSE_TYPE_HINT, parseEnabledTypes, type CourseType } from "@/lib/courseTypes";

// The academy's three course types, each switched on or off. Off = hidden from
// the public site and the learner catalogue (courses are kept, learners who
// already started keep their access). Shown to admins and instructors alike.
export default function CourseTypeSwitches({ slug, enabledTypes, counts }: { slug: string; enabledTypes: string | null | undefined; counts: Record<CourseType, number> }) {
  const enabled = new Set(parseEnabledTypes(enabledTypes));
  const bound = setCourseTypeEnabled.bind(null, slug);
  return (
    <div className="app-card p-6 mb-8" id="course-types">
      <h2 className="font-semibold text-gray-900">Course types</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">Choose which kinds of courses your academy offers. A switched-off type is hidden from learners and from your public home page; nothing is deleted.</p>
      <div className="grid md:grid-cols-3 gap-3">
        {COURSE_TYPES.map((t) => {
          const on = enabled.has(t);
          return (
            <form key={t} action={bound} className="rounded-lg border border-gray-200 p-4 flex flex-col gap-2" data-course-type={t}>
              <input type="hidden" name="type" value={t} />
              <input type="hidden" name="enabled" value={on ? "0" : "1"} />
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-gray-900">{COURSE_TYPE_LABEL[t]}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${on ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{on ? "On" : "Off"}</span>
              </div>
              <p className="text-xs text-gray-500 flex-1">{COURSE_TYPE_HINT[t]}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  {counts[t]} course{counts[t] === 1 ? "" : "s"}
                </span>
                <button type="submit" className={on ? "rounded-md border border-gray-300 px-3 py-1.5 font-semibold text-gray-700" : "app-btn-primary rounded-md px-3 py-1.5 font-semibold"}>
                  {on ? "Turn off" : "Turn on"}
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}

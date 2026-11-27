// Modules with sections: three default sections, editable; activities/resources inside them; access, completion and
// progress rules. Run with: DATABASE_URL=postgres://... npm run test:sections (use a fresh database).
import { ensureSeed } from "../lib/seed";
import { Academies, Users, Courses, Enrollments, Modules, ModuleItems, ModuleSections, ModuleCompletions, DEFAULT_SECTION_TITLES } from "../lib/queries";
import { staffModule, learnerEnrollmentsFor, moduleInCourse } from "../lib/moduleAccess";
import { staffSection, placeInSection } from "../lib/moduleSections";
import { recordCompletion, completedCourseModules, allItemsComplete } from "../lib/progress";
import { removeModuleCompletely } from "../lib/moduleCleanup";
import { queryOne } from "../lib/db";
import { courseFunnel, courseLearners } from "../lib/analytics";
import type { SessionPayload } from "../lib/auth";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail && !ok ? " :: " + detail : ""}`);
  if (!ok) failed++;
}
const sess = (u: { id: string; role: string; academy_id: string | null; name: string; email: string }): SessionPayload =>
  ({ userId: u.id, role: u.role as SessionPayload["role"], academyId: u.academy_id, academySlug: "brightwave", name: u.name, email: u.email });

async function main() {
  await ensureSeed();
  const bw = (await Academies.bySlug("brightwave"))!;
  const rw = (await Academies.bySlug("riverside"))!;
  const admin = (await Users.listByAcademy(bw.id, "ACADEMY_ADMIN"))[0];
  const instructors = await Users.listByAcademy(bw.id, "INSTRUCTOR");
  const learners = await Users.listByAcademy(bw.id, "LEARNER");
  const adminRw = (await Users.listByAcademy(rw.id, "ACADEMY_ADMIN"))[0];

  // ---- defaults ----
  check("the default section names are the three requested", JSON.stringify([...DEFAULT_SECTION_TITLES]) === JSON.stringify(["Training Session", "Activities", "Further Learning & Resources"]));
  const box = await Modules.create({ academy_id: bw.id, created_by: instructors[0].id, title: "Data analytics module", description: "d", content_type: "SECTIONS" });
  await ModuleSections.createDefaults(box.id);
  let secs = await ModuleSections.listByModule(box.id);
  check("a new module starts with exactly the 3 default sections, in order", secs.map((s) => s.title).join("|") === "Training Session|Activities|Further Learning & Resources");

  // ---- sections: rename / add / move / delete ----
  await ModuleSections.rename(secs[0].id, "Live training");
  const extra = await ModuleSections.create(box.id, "Case studies");
  secs = await ModuleSections.listByModule(box.id);
  check("sections can be renamed and added", secs.length === 4 && secs[0].title === "Live training" && secs[3].title === "Case studies");
  await ModuleSections.move(extra.id, "up");
  secs = await ModuleSections.listByModule(box.id);
  check("sections can be reordered", secs[2].id === extra.id && secs[3].title === "Further Learning & Resources");
  await ModuleSections.move(secs[0].id, "up"); // already first: no change
  check("moving the first section up changes nothing", (await ModuleSections.listByModule(box.id))[0].id === secs[0].id);

  // ---- items ----
  const [s1, s2] = secs;
  const mk = async (title: string) => Modules.create({ academy_id: bw.id, created_by: instructors[0].id, title, description: "", content_type: "URL", content_url: "https://example.org/x" });
  const a = await mk("Slides 2.1"), b = await mk("Slides 2.2"), c = await mk("Reading list");
  const holderA = await placeInSection(sess(admin), a.id, s1.id);
  await placeInSection(sess(admin), b.id, s1.id);
  await placeInSection(sess(admin), c.id, s2.id);
  check("placing an item returns the module that holds it", holderA?.id === box.id);
  const list = await ModuleItems.listByParent(box.id);
  check("items sit in their sections in the order added", list.length === 3 && list.filter((i) => i.section_id === s1.id).map((i) => i.title).join("|") === "Slides 2.1|Slides 2.2");
  await ModuleItems.move(b.id, "up");
  check("items can be reordered inside a section", (await ModuleItems.listByParent(box.id)).filter((i) => i.section_id === s1.id)[0].id === b.id);
  await ModuleItems.moveToSection(c.id, s1.id);
  check("an item can move to another section", (await ModuleItems.countBySection(s1.id)) === 3 && (await ModuleItems.countBySection(s2.id)) === 0);
  check("a section outside the caller's academy can't be used", (await placeInSection(sess(adminRw), (await mk("x")).id, s1.id)) === null && !(await staffSection(sess(adminRw), s1.id)));

  // ---- library hides items ----
  const lib = await Modules.listByAcademy(bw.id);
  check("the module library lists the module but not the items inside it", lib.some((m) => m.id === box.id) && !lib.some((m) => [a.id, b.id, c.id].includes(m.id)));

  // ---- instructor access ----
  const owner = sess(instructors[0]);
  check("the instructor who owns the module manages its items", !!(await staffModule(owner, box.id)) && !!(await staffModule(owner, a.id)));
  if (instructors.length > 1) {
    check("another instructor can't manage the module or its items", !(await staffModule(sess(instructors[1]), box.id)) && !(await staffModule(sess(instructors[1]), a.id)));
  }
  check("an admin of another academy can't see them", !(await staffModule(sess(adminRw), box.id)) && !(await staffModule(sess(adminRw), a.id)));

  // ---- course, enrolment, access and completion ----
  const course = await Courses.create({ academy_id: bw.id, created_by: admin.id, title: "Sections course", description: "d", category: "x", price_pence: 0, cover_emoji: "📘" });
  await Modules.assignToCourse(course.id, box.id, 0);
  const lone = await Modules.create({ academy_id: bw.id, created_by: admin.id, title: "Standalone", description: "", content_type: "TEXT", content_text: "hi" });
  await Modules.assignToCourse(course.id, lone.id, 1);
  const learner = learners[0], outsider = learners[1];
  const enr = await Enrollments.create({ academy_id: bw.id, course_id: course.id, learner_id: learner.id, payment_status: "free" });
  check("the course lists the module, not its items", (await Modules.listByCourse(course.id)).map((m) => m.id).join() === [box.id, lone.id].join() && (await Modules.countByCourse(course.id)) === 2);
  check("an enrolled learner can reach the items", (await learnerEnrollmentsFor(bw.id, learner.id, a.id)).length === 1 && (await moduleInCourse(course.id, a.id)) && !(await moduleInCourse(course.id, "nope")));
  check("a learner who is not enrolled can't", (await learnerEnrollmentsFor(bw.id, outsider.id, a.id)).length === 0);

  await recordCompletion(enr, a.id);
  let e1 = (await Enrollments.byId(enr.id))!;
  check("finishing one of three items does not complete the module or move progress", !(await ModuleCompletions.isComplete(enr.id, box.id)) && e1.progress_pct === 0);
  await recordCompletion(enr, b.id);
  check("two of three still isn't enough", !(await allItemsComplete(enr.id, box.id)));
  await recordCompletion(enr, c.id);
  e1 = (await Enrollments.byId(enr.id))!;
  check("finishing every item completes the module", await ModuleCompletions.isComplete(enr.id, box.id));
  check("progress counts the course's modules only (1 of 2 = 50%, not 4 of 2)", e1.progress_pct === 50 && (await completedCourseModules(enr.id, course.id)) === 1, `progress ${e1.progress_pct}`);
  await recordCompletion(enr, lone.id);
  check("then the whole course is 100%", (await Enrollments.byId(enr.id))!.progress_pct === 100);

  // ---- analytics ignore item completions in module counts ----
  const funnel = await courseFunnel(bw.id, course.id);
  check("the course funnel lists the module once and counts its completion", funnel.length === 2 && funnel.find((f) => f.id === box.id)?.completed === 1);
  const cl = (await courseLearners(bw.id, course.id)).find((l) => l.id === learner.id);
  check("learner report counts 2 modules done (not 5)", cl?.modulesDone === 2, `done ${cl?.modulesDone}`);

  // ---- empty container can be completed by hand; deleting cascades ----
  const empty = await Modules.create({ academy_id: bw.id, created_by: admin.id, title: "Empty", description: "", content_type: "SECTIONS" });
  check("an empty module has no items to hold it back", (await ModuleItems.countByParent(empty.id)) === 0 && !(await allItemsComplete(enr.id, empty.id)));
  await ModuleSections.remove(s1.id);
  const left = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM modules WHERE id = ANY($1::text[])", [[a.id, b.id, c.id]]);
  check("deleting a section deletes the items in it", left?.n === 0);
  const d = await mk("Another item");
  await placeInSection(sess(admin), d.id, s2.id);
  await removeModuleCompletely((await Modules.byId(box.id))!);
  const gone = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM modules WHERE id = ANY($1::text[])", [[box.id, d.id]]);
  const sGone = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM module_sections WHERE module_id = $1", [box.id]);
  check("deleting the module deletes its sections and items", gone?.n === 0 && sGone?.n === 0);

  if (failed) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

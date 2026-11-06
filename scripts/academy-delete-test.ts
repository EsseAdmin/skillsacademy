// Regression test for "permanently delete academy" in Super Admin.
// Run: DATABASE_URL=postgres://… npx tsx scripts/academy-delete-test.ts
// Deletes seeded demo academies, so use a throwaway database.
import { ensureSeed } from "../lib/seed";
import { Academies, Templates, Users, Courses, Modules, Enrollments } from "../lib/queries";
import { exec, queryOne, newId, nowIso } from "../lib/db";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
async function count(sql: string, params: unknown[]): Promise<number> {
  return Number((await queryOne<{ n: string }>(sql, params))!.n);
}

async function eraseAndCheck(slug: string, label: string) {
  const a = (await Academies.bySlug(slug))!;
  await Academies.softDelete(a.id);
  let err: Error | null = null;
  try {
    await Academies.permanentlyDelete(a.id);
  } catch (e) {
    err = e as Error;
  }
  check(`${label}: permanent delete succeeds`, !err, err?.message ?? "");
  if (err) return;
  check(`${label}: academy, users, courses, modules and custom templates are gone`,
    (await count("SELECT count(*) AS n FROM academies WHERE id = $1", [a.id])) === 0 &&
      (await count("SELECT count(*) AS n FROM users WHERE academy_id = $1", [a.id])) === 0 &&
      (await count("SELECT count(*) AS n FROM courses WHERE academy_id = $1", [a.id])) === 0 &&
      (await count("SELECT count(*) AS n FROM modules WHERE academy_id = $1", [a.id])) === 0 &&
      (await count("SELECT count(*) AS n FROM templates WHERE academy_id = $1", [a.id])) === 0);
}

async function main() {
  await ensureSeed();
  const presetsBefore = await count("SELECT count(*) AS n FROM templates WHERE academy_id IS NULL", []);

  // A plain seeded academy.
  await eraseAndCheck("riverside", "Seeded academy");

  // An academy that switched to its own custom template (what "Generate with
  // AI" does) and has used the content agent and AI usage metering.
  const b = (await Academies.bySlug("brightwave"))!;
  const t = await Templates.createCustom({ academy_id: b.id, name: "Custom", description: "d", primary_color: "#112233", secondary_color: "#223344", accent_color: "#334455", font_heading: "Inter" });
  await Academies.update(b.id, { template_id: t.id });
  const admin = (await Users.byAcademyAndEmail(b.id, "admin@brightwave.example"))!;
  await exec("INSERT INTO ai_usage (id, academy_id, user_id, source, created_at) VALUES ($1, $2, $3, 'agent', $4)", [newId(), b.id, admin.id, nowIso()]);
  await exec(
    "INSERT INTO ai_drafts (id, academy_id, requested_by, action, instruction, kind, title, proposal_json, status, created_at) VALUES ($1, $2, $3, 'NEW_MODULE', 'x', 'TEXT', 't', '{}', 'PENDING', $4)",
    [newId(), b.id, admin.id, nowIso()]
  );
  await eraseAndCheck("brightwave", "Academy with a custom template, AI usage and drafts");
  check("Built-in template presets are untouched", (await count("SELECT count(*) AS n FROM templates WHERE academy_id IS NULL", [])) === presetsBefore);
  check("AI usage and drafts were removed with the academy", (await count("SELECT count(*) AS n FROM ai_usage WHERE academy_id = $1", [b.id])) === 0 && (await count("SELECT count(*) AS n FROM ai_drafts WHERE academy_id = $1", [b.id])) === 0);

  // Reference unused imports so intent is clear to future editors.
  void Courses; void Modules; void Enrollments;
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

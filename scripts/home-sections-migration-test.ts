// The public page is just headline, tagline and courses. An academy that had written an About text or
// "What you'll learn" points keeps them as HIDDEN homepage sections, once. Run:
//   DATABASE_URL=postgres://… npx tsx scripts/home-sections-migration-test.ts   (use a throwaway database)
import { ensureSeed } from "../lib/seed";
import { Academies } from "../lib/queries";
import { exec, queryAll, queryOne, pool, SCHEMA } from "../lib/db";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

async function main() {
await ensureSeed();
const a = (await Academies.bySlug("brightwave"))!;
const b = (await queryOne<{ id: string }>("SELECT id FROM academies WHERE id <> $1 ORDER BY created_at LIMIT 1", [a.id]))!;
check("seeded academies start as migrated (nothing to convert)", (await queryOne<{ n: string }>("SELECT count(*) AS n FROM academies WHERE NOT home_sections_migrated"))!.n === "0");

// Pretend academy A is an older one with content written under the old home page, and B is old but empty.
await exec("UPDATE academies SET home_sections_migrated = FALSE, about_text = 'We help teams onboard well.', learn_items = E'Plan a kickoff\\nRun a review' WHERE id = $1", [a.id]);
await exec("UPDATE academies SET home_sections_migrated = FALSE, about_text = '   ', learn_items = '' WHERE id = $1", [b.id]);
await pool.query(SCHEMA);

const blocks = await queryAll<{ id: string; block_type: string; title: string; body_text: string; is_published: number }>("SELECT id, block_type, title, body_text, is_published FROM site_blocks WHERE academy_id = $1 ORDER BY order_index", [a.id]);
const about = blocks.find((x) => x.block_type === "TEXT" && x.id === `about-${a.id}`);
const learn = blocks.find((x) => x.block_type === "LEARN");
check("About text became a hidden TEXT section", !!about && about.body_text === "We help teams onboard well." && about.is_published === 0);
check("'What you'll learn' became a hidden LEARN section", !!learn && learn.body_text === "Plan a kickoff\nRun a review" && learn.is_published === 0);
check("an academy with nothing written gets no sections", (await queryAll("SELECT id FROM site_blocks WHERE academy_id = $1 AND id LIKE 'about-%'", [b.id])).length === 0);
check("every academy is now marked migrated", (await queryOne<{ n: string }>("SELECT count(*) AS n FROM academies WHERE NOT home_sections_migrated"))!.n === "0");

// Running it again (every boot) must not duplicate, and must not resurrect a section the admin deleted.
await pool.query(SCHEMA);
check("a second boot adds nothing", (await queryAll("SELECT id FROM site_blocks WHERE academy_id = $1 AND (id LIKE 'about-%' OR id LIKE 'learn-%')", [a.id])).length === 2);
await exec("DELETE FROM site_blocks WHERE id = $1", [`about-${a.id}`]);
await pool.query(SCHEMA);
check("a section the admin deleted does not come back", (await queryAll("SELECT id FROM site_blocks WHERE id = $1", [`about-${a.id}`])).length === 0);

await pool.end();
}
main().then(() => {
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});

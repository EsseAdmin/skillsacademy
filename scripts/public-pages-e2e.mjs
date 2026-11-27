// Browser/HTTP check for the public legal and information pages: /privacy, /compare, /compare/<rival>, /roadmap and the footer links.
// Run against a started app: PUBLIC_TEST_BASE_URL=http://localhost:3152 node scripts/public-pages-e2e.mjs
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const BASE = process.env.PUBLIC_TEST_BASE_URL || "http://localhost:3152";
const get = async (p) => { const r = await fetch(BASE + p, { redirect: "manual" }); return { status: r.status, html: await r.text() }; };
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

const home = await get("/");
const footerHrefs = ["/terms", "/privacy"].filter((h) => home.html.includes(`href="${h}"`));
check("homepage footer links to terms and privacy", footerHrefs.length === 2, footerHrefs.join(","));
check("homepage footer no longer links to compare or roadmap", !home.html.includes('href="/compare"') && !home.html.includes('href="/roadmap"'));

const priv = await get("/privacy");
const pt = text(priv.html);
check("/privacy loads with its sections", priv.status === 200 && /Who we are/.test(pt) && /Your rights/.test(pt) && /Information Commissioner/.test(pt));
check("/privacy shows the draft notice while company details are unset", /privacy-draft-notice/.test(priv.html));
check("terms page links to the privacy notice", /href="\/privacy"/.test((await get("/terms")).html));
check("sign-up page mentions the privacy notice", /href="\/privacy"/.test((await get("/signup")).html));

const idx = await get("/compare");
check("/compare lists the four rivals", idx.status === 200 && ["Thinkific", "Teachable", "Kajabi", "TalentLMS"].every((n) => text(idx.html).includes("SkillsAcademy.ai vs " + n)));
for (const slug of ["thinkific", "teachable", "kajabi", "talentlms"]) {
  const r = await get("/compare/" + slug);
  const t = text(r.html);
  check(`/compare/${slug} has the table, both strengths lists, source and checked date`, r.status === 200 && /Where .+ is stronger/.test(t) && /Where SkillsAcademy\.ai fits better/.test(t) && /as read on 27 November 2026/.test(t) && /We are not affiliated/.test(t));
  check(`/compare/${slug} is honest about what we lack`, /No built-in checkout for learners/.test(t) && (slug === "talentlms" ? /no single sign-on/.test(t) : /No community space/.test(t)));
}
check("an unknown comparison is a 404", (await get("/compare/nope")).status === 404);
const kajabi = text((await get("/compare/kajabi")).html);
check("Kajabi page does not overstate: attributes SCORM to Kajabi's own FAQ", /States in its FAQ that it is not SCORM compliant/.test(kajabi));

const rm = await get("/roadmap");
const rt = text(rm.html);
check("/roadmap shows planned and shipped", rm.status === 200 && /Coming next/.test(rt) && /Recently shipped/.test(rt) && /not promises/.test(rt));
check("/roadmap lists Portuguese as shipped", /Portuguese/.test(rt));

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);

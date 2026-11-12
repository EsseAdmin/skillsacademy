// Tests for pass 42: the Help assistant for academy admins.
//   DATABASE_URL=postgres://… npx tsx scripts/help-test.ts
import { ensureSeed } from "../lib/seed";
import { Academies, Users } from "../lib/queries";
import { Journeys } from "../lib/journeys";
import { exec } from "../lib/db";
import { askHelp, cleanHistory, linksFor, answerFromGuide, academySnapshot, helpSystemPrompt, type HelpAsker } from "../lib/aiHelp";
import { searchGuide, helpTopics, HELP_LINKS } from "../lib/helpGuide";
import { getAiUsage, withAiMeter, reserveAiAction, isHelpLimitError, HELP_DAILY_LIMIT } from "../lib/aiUsage";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

async function main() {
  await ensureSeed();
  const bw = (await Academies.bySlug("brightwave"))!;
  const admin = (await Users.listByAcademy(bw.id, "ACADEMY_ADMIN"))[0];

  // ---- history cleaning ----
  check("history: junk is dropped, long text is cut, it ends on the user's question", (() => {
    const h = cleanHistory([{ role: "system", text: "x" }, { role: "assistant", text: "orphan" }, { role: "user", text: "a".repeat(5000) }, { role: "assistant", text: "ok" }, { role: "user", text: " hi   there " }, 5, null, { role: "assistant", text: "" }]);
    return h.length === 3 && h[0].role === "user" && h[0].text.length === 1000 && h[2].text === "hi there";
  })());
  check("history: only the last 10 messages are kept", cleanHistory(Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}` }))).length <= 10);
  check("history: not an array = empty", cleanHistory("nope").length === 0 && cleanHistory(undefined).length === 0);

  // ---- links are chosen by name and built by the server ----
  const links = linksFor("brightwave", ["journeys", "bogus", "journeys", "https://evil.example", "analytics", { x: 1 }, "billing", "people", "site"]);
  check("links: unknown names and URLs are dropped, duplicates removed, at most 4", links.length === 4 && links[0].href === "/a/brightwave/admin/journeys" && links.every((l) => l.href.startsWith("/a/brightwave/admin")));
  check("links: dashboard is the admin root", linksFor("x", ["dashboard"])[0].href === "/a/x/admin");
  check("every link in the guide points at a known page", helpTopics().every((t) => t.links.every((k) => k in HELP_LINKS)));

  // ---- the no-AI guide search ----
  const top = (q: string) => searchGuide(q, 1)[0]?.id;
  check("search: journey question", top("why isn't my learning journey showing on the home page") === "journeys");
  check("search: add a module", top("how do I add a module to a course") === "add-modules");
  check("search: sections", top("how do I rename a section and add activities under training session") === "module-sections");
  check("search: payments", top("how do I charge for my courses, can learners pay") === "payments");
  check("search: reports", top("which learners are stuck, I want a report") === "analytics");
  check("search: nonsense finds nothing", searchGuide("zzzz qqqq").length === 0);
  const g = answerFromGuide("brightwave", "how do I take payments");
  check("guide answer explains the payment link and carries links", g.fromGuide === true && g.links.length > 0 && /Payment link/.test(g.text) && !/Stripe/.test(g.text) && g.links.some((l) => l.href === "/a/brightwave/admin/courses"));
  check("guide answer for gibberish still helps", answerFromGuide("brightwave", "zzzz").links.length > 0);
  check("the guide no longer mentions an in-platform payment page", !helpTopics().some((t) => /Course payments/.test(t.body)) && !("payments" in HELP_LINKS));

  // ---- the academy snapshot explains why a journey is hidden ----
  const jid = await Journeys.create(bw.id, admin.id, "Help test journey");
  await exec("UPDATE academies SET is_published = 0 WHERE id = $1", [bw.id]);
  const snap = (await academySnapshot(bw.id)) as { publicSitePublished: boolean; journeys: { title: string; problems: string[] }[]; academyWideJourneyProblems: string[]; counts: Record<string, number> };
  const j = snap.journeys.find((x) => x.title === "Help test journey")!;
  check("snapshot: site unpublished is reported", snap.publicSitePublished === false && snap.academyWideJourneyProblems.some((p) => /isn't published/.test(p)));
  check("snapshot: an empty journey is reported as empty", j.problems.some((p) => /No station/.test(p)));
  check("snapshot: has counts and no people's names or emails", snap.counts.courses > 0 && !/@/.test(JSON.stringify(snap)));

  // ---- asking the model (faked) ----
  let seen: { system: string; messages: { role: string; text: string }[] } | null = null;
  const fake: HelpAsker = async (input) => {
    seen = { system: input.system, messages: input.messages };
    return { answer: "  Open Learning journeys and add a station.  ", links: ["journeys", "not-a-page", "https://evil.example"] };
  };
  const ans = await askHelp(bw.id, "brightwave", [{ role: "user", text: "Why is my journey hidden?" }], { asker: fake });
  check("askHelp returns the cleaned answer with server-built links", ans.text === "Open Learning journeys and add a station." && ans.links.length === 1 && ans.links[0].href === "/a/brightwave/admin/journeys" && !ans.fromGuide);
  check("the model is given the guide and this academy's facts", !!seen && (seen as { system: string }).system.includes("PLATFORM GUIDE") && (seen as { system: string }).system.includes("Help test journey") && (seen as { system: string }).system.includes("ONLY the guide"));
  check("the prompt says the assistant cannot change anything", /cannot change anything/.test(helpSystemPrompt({}, "en")));
  let threw = "";
  try {
    await askHelp(bw.id, "brightwave", [{ role: "user", text: "q" }], { asker: async () => ({ answer: "   " }) });
  } catch (e) {
    threw = (e as Error).message;
  }
  check("an empty model answer is an error (the action then falls back to the guide)", /didn't return an answer/.test(threw));
  const fr = await (async () => {
    await exec("UPDATE academies SET language = 'fr' WHERE id = $1", [bw.id]);
    let s = "";
    await askHelp(bw.id, "brightwave", [{ role: "user", text: "q" }], { asker: async (i) => ((s = i.system), { answer: "ok" }) });
    await exec("UPDATE academies SET language = 'en' WHERE id = $1", [bw.id]);
    return s;
  })();
  check("the assistant is told to answer in the academy's language", /French/i.test(fr.slice(-400)));

  // ---- metering: help does not use the monthly allowance, but has a daily limit ----
  const before = await getAiUsage(bw.id);
  for (let i = 0; i < 3; i++) await withAiMeter({ academyId: bw.id, userId: admin.id, source: "help" }, () => reserveAiAction());
  const after = await getAiUsage(bw.id);
  check("help questions do not count against the monthly AI allowance", after.used === before.used && after.remaining === before.remaining);
  let limited = false;
  try {
    for (let i = 0; i < HELP_DAILY_LIMIT + 2; i++) await withAiMeter({ academyId: bw.id, userId: admin.id, source: "help" }, () => reserveAiAction());
  } catch (e) {
    limited = isHelpLimitError(e);
  }
  check(`the ${HELP_DAILY_LIMIT}/day help limit stops further questions`, limited);
  await withAiMeter({ academyId: bw.id, userId: admin.id, source: "generate" }, () => reserveAiAction());
  check("a normal AI action still counts monthly even after the help limit", (await getAiUsage(bw.id)).used === before.used + 1);

  await exec("UPDATE academies SET is_published = 1 WHERE id = $1", [bw.id]);
  await Journeys.remove(jid);
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

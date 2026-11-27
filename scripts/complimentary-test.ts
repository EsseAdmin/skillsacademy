// Complimentary (free) academies: the period / unlimited rules and the stored grant. Run with:
// DATABASE_URL=postgres://... npx tsx scripts/complimentary-test.ts (use a fresh database).
import { complimentaryState, parseComplimentaryEnd, cleanNote, isComplimentaryActive } from "../lib/complimentary";
import { ensureSeed } from "../lib/seed";
import { Academies } from "../lib/queries";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail && !ok ? " :: " + detail : ""}`);
  if (!ok) failed++;
}
const none = { is_complimentary: 0, complimentary_until: null, complimentary_note: null, complimentary_granted_at: null };
const now = Date.parse("2026-11-12T10:00:00Z");

async function main() {
  // ---- rules ----
  check("not granted -> not free", !complimentaryState(none, now).active && !complimentaryState(none, now).granted);
  const unl = complimentaryState({ ...none, is_complimentary: 1 }, now);
  check("granted with no end date is unlimited and active", unl.active && unl.unlimited && !unl.expired && unl.until === null && unl.daysLeft === null);
  const dated = complimentaryState({ ...none, is_complimentary: 1, complimentary_until: "2026-11-15T23:59:59.999Z" }, now);
  check("a dated grant is active with days left", dated.active && !dated.unlimited && dated.daysLeft === 4, JSON.stringify(dated));
  const ended = complimentaryState({ ...none, is_complimentary: 1, complimentary_until: "2026-11-11T23:59:59.999Z" }, now);
  check("an ended grant is expired, not active (falls back to normal billing)", ended.granted && ended.expired && !ended.active && ended.daysLeft === 0);
  check("the last day still counts as free until its end", complimentaryState({ ...none, is_complimentary: 1, complimentary_until: "2026-11-12T23:59:59.999Z" }, now).active);
  check("a leftover end date means nothing when not granted", !complimentaryState({ ...none, complimentary_until: "2030-01-01T00:00:00Z" }, now).active);

  // ---- parsing the date the Super Admin types ----
  const ok = parseComplimentaryEnd("2026-12-31", now);
  check("a future date becomes the end of that day (UTC)", ok.ok && ok.iso === "2026-12-31T23:59:59.999Z");
  check("today is allowed until the day is over", parseComplimentaryEnd("2026-11-12", now).ok);
  check("yesterday is refused", !parseComplimentaryEnd("2026-11-11", now).ok);
  check("blank / wrong format is refused", !parseComplimentaryEnd("", now).ok && !parseComplimentaryEnd("31/12/2026", now).ok);
  check("an impossible date is refused", !parseComplimentaryEnd("2026-02-31", now).ok);
  check("more than ten years ahead is refused", !parseComplimentaryEnd("2040-01-01", now).ok && parseComplimentaryEnd("2035-01-01", now).ok);
  check("notes are tidied and capped at 200 characters", cleanNote("  a   b \n c ") === "a b c" && cleanNote("x".repeat(500))!.length === 200 && cleanNote("   ") === null);

  // ---- stored grant ----
  await ensureSeed();
  const bw = (await Academies.bySlug("brightwave"))!;
  check("an existing academy starts as not complimentary", bw.is_complimentary === 0 && !isComplimentaryActive(bw));
  await Academies.grantComplimentary(bw.id, null, "Charity partner");
  let a = (await Academies.byId(bw.id))!;
  check("granting unlimited is stored with its note", isComplimentaryActive(a) && complimentaryState(a).unlimited && a.complimentary_note === "Charity partner" && !!a.complimentary_granted_at);
  await Academies.grantComplimentary(bw.id, "2027-01-31T23:59:59.999Z", null);
  a = (await Academies.byId(bw.id))!;
  check("it can be changed to a dated period", complimentaryState(a).active && !complimentaryState(a).unlimited && a.complimentary_until === "2027-01-31T23:59:59.999Z" && a.complimentary_note === null);
  check("it doesn't touch the subscription or trial fields", a.subscription_status === bw.subscription_status && a.trial_ends_at === bw.trial_ends_at && a.plan_id === bw.plan_id && a.stripe_subscription_id === bw.stripe_subscription_id);
  await Academies.revokeComplimentary(bw.id);
  a = (await Academies.byId(bw.id))!;
  check("revoking clears everything", !a.is_complimentary && a.complimentary_until === null && a.complimentary_note === null && a.complimentary_granted_at === null);
  const other = (await Academies.bySlug("riverside"))!;
  check("other academies are unaffected", other.is_complimentary === 0);
}

main().then(() => { console.log(failed ? `\n${failed} FAILED` : "\nAll passed"); process.exit(failed ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });

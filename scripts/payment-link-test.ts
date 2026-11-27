// Course payment links: the platform takes no payments; a course can carry an optional https payment link.
// Run with: npm run test:payment-link (needs DATABASE_URL).
import { ensureSeed } from "../lib/seed";
import { Academies, Courses, Users } from "../lib/queries";
import { courseNeedsPayment, parsePaymentUrl } from "../lib/coursePayment";
import { HELP_LINKS } from "../lib/helpGuide";
import { ADMIN_NAV } from "../lib/nav";

let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
  if (!ok) failed++;
}

async function main() {
  await ensureSeed();
  const bw = (await Academies.bySlug("brightwave"))!;
  const admin = (await Users.listByAcademy(bw.id, "ACADEMY_ADMIN"))[0];

  check("empty input = no link, not invalid", JSON.stringify(parsePaymentUrl("  ")) === JSON.stringify({ url: null, invalid: false }) && parsePaymentUrl(null).url === null);
  check("https link is accepted", parsePaymentUrl("https://pay.example.org/course?id=1").url === "https://pay.example.org/course?id=1");
  check("http, javascript:, credentials and junk are rejected", ["http://x.example", "javascript:alert(1)", "https://u:p@x.example", "not a url", "data:text/html,hi"].every((v) => parsePaymentUrl(v).invalid && parsePaymentUrl(v).url === null));

  check("needs payment: price or link", courseNeedsPayment({ price_pence: 100 }) && courseNeedsPayment({ price_pence: 0, payment_url: "https://x.example" }) && !courseNeedsPayment({ price_pence: 0, payment_url: null }));

  const c = await Courses.create({ academy_id: bw.id, created_by: admin.id, title: "Link test", description: "", category: "General", price_pence: 0, payment_url: "https://pay.example.org/a", cover_emoji: "📘" });
  check("a course stores its payment link", c.payment_url === "https://pay.example.org/a");
  const u1 = (await Courses.update(c.id, { title: "Link test 2" }))!;
  check("updating other fields keeps the link", u1.payment_url === "https://pay.example.org/a" && u1.title === "Link test 2");
  const u2 = (await Courses.update(c.id, { payment_url: null }))!;
  check("the link can be cleared", u2.payment_url === null);
  const plain = await Courses.create({ academy_id: bw.id, created_by: admin.id, title: "No link", description: "", category: "General", price_pence: 0, cover_emoji: "📘" });
  check("a course without a link has none", plain.payment_url === null && !courseNeedsPayment(plain));

  check("no in-platform payments page in the admin menu or help links", !ADMIN_NAV("x").some((n) => /payments/.test(n.href)) && !("payments" in HELP_LINKS));

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

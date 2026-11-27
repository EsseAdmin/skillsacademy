// Private Super Admin portal: secret-address helpers, the public pages carrying no link to it, and the emailed sign-in
// code rules. Run with: DATABASE_URL=postgres://... npx tsx scripts/portal-test.ts (use a fresh database).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normaliseSecretPath, saHref, isPortalHref, secretPathState, superAdminBase } from "../lib/superAdminPath";
import { twoFactorState, codeRecipient, issueLoginCode, checkLoginCode, maskEmail, MAX_ATTEMPTS } from "../lib/superAdminTwoFactor";
import { DEFAULT_HOME_PAGE } from "../lib/marketingPage";
import { SUPER_ADMIN_NAV } from "../lib/nav";
import { ensureSeed } from "../lib/seed";
import { SuperAdmins } from "../lib/queries";
import { exec } from "../lib/db";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail && !ok ? " :: " + detail : ""}`);
  if (!ok) failed++;
}
const capture = path.join(os.tmpdir(), "skillsacademy-last-email.json");
const lastCode = () => /is (\d{6})\./.exec(JSON.parse(fs.readFileSync(capture, "utf8")).text)![1];

async function main() {
  // ---- address helpers ----
  delete process.env.SUPER_ADMIN_PATH;
  check("with nothing set the portal is at /super-admin and flagged 'default'", superAdminBase() === "/super-admin" && secretPathState() === "default");
  check("saHref leaves it alone then", saHref("/super-admin/plans") === "/super-admin/plans");
  process.env.SUPER_ADMIN_PATH = "owner-7k3m9x2q/";
  check("a secret path is normalised (leading slash, no trailing slash)", normaliseSecretPath(process.env.SUPER_ADMIN_PATH) === "/owner-7k3m9x2q" && secretPathState() === "secret");
  check("saHref maps the portal and its query strings", saHref("/super-admin") === "/owner-7k3m9x2q" && saHref("/super-admin/plans") === "/owner-7k3m9x2q/plans" && saHref("/super-admin?x=1") === "/owner-7k3m9x2q?x=1");
  check("saHref passes other paths through, including look-alikes", saHref("/a/x/admin") === "/a/x/admin" && saHref("/super-admins") === "/super-admins");
  check("every nav item uses the secret address", SUPER_ADMIN_NAV().length > 0 && SUPER_ADMIN_NAV().every((n) => n.href.startsWith("/owner-7k3m9x2q")));
  for (const bad of ["/short", "/has space here", "/a/b/c-long-enough", "/super-admin", "/../../etcetera", "/" + "x".repeat(65)]) {
    check(`rejects ${JSON.stringify(bad).slice(0, 30)}`, normaliseSecretPath(bad) === null);
  }
  process.env.SUPER_ADMIN_PATH = "bad one";
  check("an unusable value is ignored (never locks the owner out) and flagged", superAdminBase() === "/super-admin" && secretPathState() === "invalid");
  process.env.SUPER_ADMIN_PATH = "/owner-7k3m9x2q";
  check("portal links are recognised under both addresses", isPortalHref("/super-admin/login") && isPortalHref("/owner-7k3m9x2q/plans") && isPortalHref(" /SUPER-ADMIN ") && !isPortalHref("/signup") && !isPortalHref("/owner-7k3m9x2qq"));
  check("the built-in public page has no link to the portal", [...DEFAULT_HOME_PAGE.footer.links, ...DEFAULT_HOME_PAGE.nav.links].every((l) => !isPortalHref(l.href) && !/admin/i.test(l.label.replace("Academy Login", ""))));

  // ---- two-step sign-in rules ----
  const env = process.env as Record<string, string | undefined>;
  delete env.RESEND_API_KEY;
  env.SUPER_ADMIN_2FA = "off";
  check("SUPER_ADMIN_2FA=off is the emergency switch", twoFactorState() === "off-switch");
  env.SUPER_ADMIN_2FA = "on";
  check("SUPER_ADMIN_2FA=on forces it", twoFactorState() === "on");
  delete env.SUPER_ADMIN_2FA;
  const prevEnv = env.NODE_ENV;
  env.NODE_ENV = "production";
  check("in production with no email key it can't work, so it is flagged off", twoFactorState() === "off-no-email");
  env.RESEND_API_KEY = "re_x";
  check("…and switches itself on once an email key exists", twoFactorState() === "on");
  delete env.RESEND_API_KEY;
  env.NODE_ENV = prevEnv;

  delete env.SUPER_ADMIN_CODE_EMAIL;
  check("the code goes to the account's own email by default", codeRecipient("a@b.co") === "a@b.co");
  env.SUPER_ADMIN_CODE_EMAIL = " owner@example.org ";
  check("SUPER_ADMIN_CODE_EMAIL redirects the code", codeRecipient("a@b.co") === "owner@example.org");
  env.SUPER_ADMIN_CODE_EMAIL = "not an email, x@y.z";
  check("a malformed override is ignored", codeRecipient("a@b.co") === "a@b.co");
  env.SUPER_ADMIN_CODE_EMAIL = "owner@example.org";

  await ensureSeed();
  const admin = (await SuperAdmins.byEmail("superadmin@skillsacademy.ai"))!;
  check("the code email shows a masked address", maskEmail("superadmin@skillsacademy.ai").endsWith("@skillsacademy.ai") && !maskEmail("superadmin@skillsacademy.ai").includes("superadmin"));

  try { fs.unlinkSync(capture); } catch { /* none yet */ }
  const a = await issueLoginCode(admin);
  check("a code is issued and emailed", a.ok && fs.existsSync(capture) && JSON.parse(fs.readFileSync(capture, "utf8")).to === "owner@example.org");
  if (!a.ok) return;
  const code = lastCode();
  const stored = await (await import("../lib/db")).queryOne<{ code_hash: string }>("SELECT code_hash FROM super_admin_login_codes WHERE id = $1", [a.challengeId]);
  check("only a hash of the code is stored", !!stored && stored.code_hash !== code && stored.code_hash.length === 64);
  const again = await issueLoginCode(admin);
  check("asking again straight away is refused (pause between emails)", !again.ok && !!again.wait);

  const wrong = code === "000000" ? "111111" : "000000";
  const w1 = await checkLoginCode(admin.id, a.challengeId, wrong);
  check("a wrong code is refused with tries left", !w1.ok && /4 tries left/.test((w1 as { error: string }).error));
  check("a code for someone else's challenge is refused", !(await checkLoginCode("other-admin", a.challengeId, code)).ok);
  check("letters / short codes are refused", !(await checkLoginCode(admin.id, a.challengeId, "12ab56")).ok);
  const good = await checkLoginCode(admin.id, a.challengeId, ` ${code.slice(0, 3)} ${code.slice(3)} `);
  check("the right code (spaces allowed) is accepted", good.ok);
  const reuse = await checkLoginCode(admin.id, a.challengeId, code);
  check("a code works only once", !reuse.ok && !!(reuse as { expired?: boolean }).expired);

  // lock-out after 5 wrong tries, even with the right code afterwards
  await exec("UPDATE super_admin_login_codes SET created_at = $1 WHERE admin_id = $2", [new Date(Date.now() - 120_000).toISOString(), admin.id]);
  const b = await issueLoginCode(admin);
  if (!b.ok) { check("second code issued", false, b.error); return; }
  const code2 = lastCode();
  let last: Awaited<ReturnType<typeof checkLoginCode>> = { ok: true };
  for (let i = 0; i < MAX_ATTEMPTS; i++) last = await checkLoginCode(admin.id, b.challengeId, code2 === "123456" ? "654321" : "123456");
  check("five wrong tries use the code up", !last.ok && !!(last as { expired?: boolean }).expired);
  check("…and the right code no longer works", !(await checkLoginCode(admin.id, b.challengeId, code2)).ok);

  // expiry and replacement
  await exec("UPDATE super_admin_login_codes SET created_at = $1 WHERE admin_id = $2", [new Date(Date.now() - 120_000).toISOString(), admin.id]);
  const c = await issueLoginCode(admin);
  if (!c.ok) { check("third code issued", false, c.error); return; }
  const code3 = lastCode();
  await exec("UPDATE super_admin_login_codes SET expires_at = $1 WHERE id = $2", [new Date(Date.now() - 1000).toISOString(), c.challengeId]);
  check("an expired code is refused", !(await checkLoginCode(admin.id, c.challengeId, code3)).ok);

  await exec("UPDATE super_admin_login_codes SET created_at = $1 WHERE admin_id = $2", [new Date(Date.now() - 120_000).toISOString(), admin.id]);
  const d = await issueLoginCode(admin);
  if (!d.ok) { check("fourth code issued", false, d.error); return; }
  const code4 = lastCode();
  await exec("UPDATE super_admin_login_codes SET created_at = $1 WHERE admin_id = $2", [new Date(Date.now() - 120_000).toISOString(), admin.id]);
  const e = await issueLoginCode(admin);
  if (!e.ok) { check("fifth code issued", false, e.error); return; }
  check("a newer code cancels the older one", !(await checkLoginCode(admin.id, d.challengeId, code4)).ok && (await checkLoginCode(admin.id, e.challengeId, lastCode())).ok);

  // hourly cap
  for (let i = 0; i < 8; i++) {
    await exec("UPDATE super_admin_login_codes SET created_at = $1 WHERE admin_id = $2", [new Date(Date.now() - 120_000).toISOString(), admin.id]);
    const r = await issueLoginCode(admin);
    if (!r.ok) { check("hourly cap stops further codes", /Too many codes/.test(r.error)); break; }
    if (i === 7) check("hourly cap stops further codes", false, "never capped");
  }
}

main().then(() => { console.log(failed ? `\n${failed} FAILED` : "\nAll passed"); process.exit(failed ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });

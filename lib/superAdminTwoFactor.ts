// Two-step sign-in for the Super Admin: after the password, a 6-digit code is emailed to the platform owner and must be
// entered within 10 minutes (5 tries per code, a short pause between emails, a few emails per hour).
//
// SUPER_ADMIN_2FA controls it:
//   unset  -> on, except in production when RESEND_API_KEY is missing (no email could be sent, so the owner would be locked
//             out; the System check page warns about it instead)
//   "on"   -> always on (used by automated tests, which read the captured email)
//   "off"  -> emergency switch: password only
import { randomInt } from "node:crypto";
import { queryAll, queryOne, exec as execute, newId, nowIso } from "@/lib/db";
import { hashLoginCode } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export const CODE_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_SECONDS = 30;
export const MAX_CODES_PER_HOUR = 6;

export type TwoFactorState = "on" | "off-switch" | "off-no-email";

export function twoFactorState(): TwoFactorState {
  const v = (process.env.SUPER_ADMIN_2FA ?? "").trim().toLowerCase();
  if (v === "off") return "off-switch";
  if (v === "on") return "on";
  if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) return "off-no-email";
  return "on";
}

/**
 * Where the sign-in code is emailed: SUPER_ADMIN_CODE_EMAIL when it is set to a valid address (so the code can go to a real
 * inbox even though the account's login email is a placeholder), otherwise the Super Admin account's own email.
 */
export function codeRecipient(adminEmail: string): string {
  const v = (process.env.SUPER_ADMIN_CODE_EMAIL ?? "").trim();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v) ? v : adminEmail;
}

export const twoFactorRequired = () => twoFactorState() === "on";

interface CodeRow { id: string; admin_id: string; code_hash: string; expires_at: string; attempts: number; used: number; created_at: string }

export type IssueResult = { ok: true; challengeId: string } | { ok: false; error: string; wait?: number };

/** Creates and emails a fresh code. Honours the pause between emails and the hourly cap. */
export async function issueLoginCode(admin: { id: string; name: string; email: string }): Promise<IssueResult> {
  const recent = await queryAll<CodeRow>(
    "SELECT * FROM super_admin_login_codes WHERE admin_id = $1 AND created_at > $2 ORDER BY created_at DESC",
    [admin.id, new Date(Date.now() - 3600_000).toISOString()]
  );
  if (recent.length >= MAX_CODES_PER_HOUR) return { ok: false, error: "Too many codes were requested. Try again in an hour." };
  if (recent[0]) {
    const age = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
    if (age < RESEND_SECONDS) return { ok: false, error: `Please wait ${Math.ceil(RESEND_SECONDS - age)} seconds before asking for another code.`, wait: Math.ceil(RESEND_SECONDS - age) };
  }
  const id = newId();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await execute(
    "INSERT INTO super_admin_login_codes (id, admin_id, code_hash, expires_at, attempts, used, created_at) VALUES ($1,$2,$3,$4,0,0,$5)",
    [id, admin.id, await hashLoginCode(id, code), new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(), nowIso()]
  );
  // Older unused codes stop working as soon as a newer one is sent.
  await execute("UPDATE super_admin_login_codes SET used = 1 WHERE admin_id = $1 AND id <> $2", [admin.id, id]);
  const text = `Your SkillsAcademy.ai Platform Admin sign-in code is ${code}.\n\nIt works for ${CODE_MINUTES} minutes. If you didn't just try to sign in, someone has your password: change it and ignore this email.`;
  const html = `<p>Your SkillsAcademy.ai Platform Admin sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It works for ${CODE_MINUTES} minutes. If you didn't just try to sign in, someone has your password: change it and ignore this email.</p>`;
  const sent = await sendEmail({ to: codeRecipient(admin.email), subject: `Your sign-in code: ${code}`, html, text });
  // With no email key (local development, or tests that force the code on) sendEmail writes the message to the server log /
  // a capture file instead; that counts as delivered so development isn't locked out.
  if (!sent.ok && process.env.RESEND_API_KEY) {
    await execute("UPDATE super_admin_login_codes SET used = 1 WHERE id = $1", [id]);
    return { ok: false, error: "The sign-in code email could not be sent. Check the email settings on the System check page." };
  }
  return { ok: true, challengeId: id };
}

export type CheckResult = { ok: true } | { ok: false; error: string; expired?: boolean };

/** Checks the code typed for a challenge; a wrong guess uses one of its 5 tries. */
export async function checkLoginCode(adminId: string, challengeId: string, typed: string): Promise<CheckResult> {
  const row = await queryOne<CodeRow>("SELECT * FROM super_admin_login_codes WHERE id = $1 AND admin_id = $2", [challengeId, adminId]);
  if (!row || row.used) return { ok: false, error: "That code is no longer valid. Sign in again.", expired: true };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: "That code has expired. Sign in again.", expired: true };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many wrong codes. Sign in again.", expired: true };
  const code = typed.replace(/\s+/g, "");
  const match = /^\d{6}$/.test(code) && (await hashLoginCode(challengeId, code)) === row.code_hash;
  if (!match) {
    await execute("UPDATE super_admin_login_codes SET attempts = attempts + 1 WHERE id = $1", [challengeId]);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return left > 0 ? { ok: false, error: `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` } : { ok: false, error: "Too many wrong codes. Sign in again.", expired: true };
  }
  // Single use: the update only succeeds for the first caller.
  const claimed = await queryOne<{ id: string }>("UPDATE super_admin_login_codes SET used = 1 WHERE id = $1 AND used = 0 RETURNING id", [challengeId]);
  return claimed ? { ok: true } : { ok: false, error: "That code is no longer valid. Sign in again.", expired: true };
}

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return email;
  return `${u.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(u.length - 1, 6)))}@${d}`;
}

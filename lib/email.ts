// Minimal transactional email sender using Resend's HTTP API directly (no
// SDK dependency — it's a single JSON POST). Requires a RESEND_API_KEY env
// var; without one, sendEmail() logs what would have been sent instead of
// throwing, so account-recovery flows still complete gracefully in local
// development or before a provider key has been added in Netlify.
//
// To go live: sign up at resend.com, verify the sending domain (the real
// production domain, skillacademies.ai), then set RESEND_API_KEY (and
// optionally EMAIL_FROM) as a Netlify environment variable for this site.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logIntegrationEvent } from "@/lib/integrationLog";

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function fromAddress(): string {
  // The real production domain is skillacademies.ai (two words: "skill" +
  // "academies") — not skillsacademy.ai ("skills" + "academy"), which this
  // default used to say. That mismatch meant Resend would reject sending
  // (a "from" address's domain has to match a domain actually verified in
  // the Resend account) even with a correct, working RESEND_API_KEY set,
  // unless EMAIL_FROM was also set to override this default — found and
  // fixed after a live verification-email delivery report traced back to
  // exactly this.
  return process.env.EMAIL_FROM || "SkillsAcademy.ai <no-reply@skillacademies.ai>";
}

// When there's no Resend key, the "would have sent" email is only visible
// in server logs — fine for a human watching the console, but a smoke test
// running as a separate process can't read that. So we also drop the most
// recent no-key email as a small JSON file in the OS temp dir (always
// writable, including on serverless /tmp) purely so local/CI test scripts
// can pick up the real reset link instead of skipping that coverage. This
// only happens on the no-API-key fallback path — once RESEND_API_KEY is set
// in a real deployment, no file is written and this has no effect.
function debugCapturePath(): string {
  return path.join(os.tmpdir(), "skillsacademy-last-email.json");
}

export interface SendEmailResult {
  ok: boolean;
  // Short human-readable reason when ok is false (shown to the super admin
  // on the System check page; never to ordinary users).
  error?: string;
}

// Where Resend is called. Overridable only so automated tests can point it at
// a local fake; production never sets it.
function resendUrl(): string {
  return process.env.RESEND_API_URL || RESEND_API_URL;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[email] RESEND_API_KEY is not set — email not actually sent. Would have sent:\n` +
        `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}`
    );
    try {
      fs.writeFileSync(
        debugCapturePath(),
        JSON.stringify({ to: input.to, subject: input.subject, text: input.text, sentAt: new Date().toISOString() }, null, 2)
      );
    } catch {
      // Best-effort only — never let a debug artifact write break the
      // actual account-recovery flow.
    }
    await logIntegrationEvent({
      kind: "email",
      level: "error",
      message: "Email not sent: RESEND_API_KEY is not set on this deployment.",
      detail: `To: ${input.to} · Subject: ${input.subject}`,
    });
    return { ok: false, error: "RESEND_API_KEY is not set." };
  }

  const from = fromAddress();
  try {
    const res = await fetch(resendUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      console.error(`[email] Resend API returned ${res.status}: ${body}`);
      await logIntegrationEvent({
        kind: "email",
        level: "error",
        message: `Resend rejected the email (HTTP ${res.status}).`,
        detail: `To: ${input.to} · From: ${from} · Subject: ${input.subject} · Response: ${body}`,
      });
      return { ok: false, error: `Resend returned ${res.status}: ${body}` };
    }
    await logIntegrationEvent({
      kind: "email",
      level: "info",
      message: "Email accepted by Resend.",
      detail: `To: ${input.to} · From: ${from} · Subject: ${input.subject} · Response: ${body}`,
    });
    return { ok: true };
  } catch (err) {
    // A failed send shouldn't surface a stack trace to the person who
    // requested it, or (for the password-reset flow specifically) leak
    // whether an account exists via an error vs. silent-success
    // difference — the caller already returns the same generic message
    // either way.
    console.error("[email] Failed to send via Resend:", err);
    const msg = err instanceof Error ? err.message : String(err);
    await logIntegrationEvent({ kind: "email", level: "error", message: "Could not reach Resend.", detail: `To: ${input.to} · ${msg}` });
    return { ok: false, error: `Could not reach Resend: ${msg}` };
  }
}

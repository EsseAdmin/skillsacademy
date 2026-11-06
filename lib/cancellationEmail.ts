// Emails around an academy admin asking to cancel and have their academy
// deleted. The platform team is told immediately (academyadmin@essesystems.co.uk,
// every super admin, plus any addresses in PLATFORM_ADMIN_EMAIL), and the person
// who asked gets a receipt. The academy is archived automatically 24 hours later.
import { SuperAdmins, type Academy } from "@/lib/queries";
import { sendEmail } from "@/lib/email";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Always told about cancellations, whatever else is configured.
export const CANCELLATION_NOTICE_EMAIL = "academyadmin@essesystems.co.uk";

/** Everyone who should hear about cancellations: the notice address, all super admins, and PLATFORM_ADMIN_EMAIL (comma separated). */
export async function platformRecipients(): Promise<string[]> {
  const fromDb = (await SuperAdmins.all()).map((a) => a.email);
  const fromEnv = (process.env.PLATFORM_ADMIN_EMAIL || "").split(/[,;\s]+/).filter((e) => e.includes("@"));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of [CANCELLATION_NOTICE_EMAIL, ...fromDb, ...fromEnv]) {
    const key = e.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(e.trim());
    }
  }
  return out;
}

function dateTimeText(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) + " (UK time)"
    : "";
}

function wrap(inner: string): string {
  return `<div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto; color: #0B1F3B;">${inner}</div>`;
}

export interface CancellationDetails {
  academy: Academy;
  requesterName: string;
  requesterEmail: string;
  planName: string;
  learners: number;
  courses: number;
  reason: string;
  billing: "stopped" | "none";
  accessUntil: string | null;
  origin: string;
}

export interface NotifyResult {
  recipients: number;
  delivered: number;
}

async function sendToAll(recipients: string[], subject: string, html: string, text: string): Promise<NotifyResult> {
  const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject, html, text })));
  return { recipients: recipients.length, delivered: results.filter((r) => r.ok).length };
}

export async function notifyPlatformOfCancellation(d: CancellationDetails): Promise<NotifyResult> {
  const recipients = await platformRecipients();
  if (recipients.length === 0) return { recipients: 0, delivered: 0 };
  const link = `${d.origin}/super-admin/academies`;
  const billingLine =
    d.billing === "stopped"
      ? "Stripe renewals have been switched off — no further payments will be taken."
      : "There was no paid Stripe subscription, so there is nothing to stop billing for (the academy was on its free trial).";
  const archiveLine = `The academy will be archived automatically at ${dateTimeText(d.academy.cancellation_archive_at)}, 24 hours after the request. Archived academies are hidden from learners and staff but kept, and can be restored from Super Admin → Academies → Deleted academies.`;
  const rows: Array<[string, string]> = [
    ["Academy", d.academy.name],
    ["Academy address", `${d.origin}/a/${d.academy.slug}`],
    ["Cancelled by", d.requesterName],
    ["Their email", d.requesterEmail],
    ["Academy contact email", d.academy.contact_email || "Not set"],
    ["Plan / status", `${d.planName} / ${d.academy.subscription_status}`],
    ["Learners / courses", `${d.learners} / ${d.courses}`],
    ["Reason", d.reason || "Not given"],
  ];
  const subject = `Cancelled: ${d.academy.name} has cancelled their subscription`;
  const html = wrap(`
    <p><strong>${escapeHtml(d.academy.name)}</strong> has cancelled their subscription and asked for the academy to be deleted.</p>
    <table style="border-collapse:collapse; font-size:14px; margin:16px 0; width:100%;">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0; color:#6b7280; vertical-align:top; white-space:nowrap;">${k}</td><td style="padding:6px 0;">${escapeHtml(v)}</td></tr>`).join("")}
    </table>
    <p style="background:#ecfdf5; border:1px solid #a7f3d0; padding:10px 14px; border-radius:6px; font-size:14px;">${escapeHtml(billingLine)}</p>
    <p style="background:#fffbeb; border:1px solid #fde68a; padding:10px 14px; border-radius:6px; font-size:14px;">${escapeHtml(archiveLine)}</p>
    <p style="margin: 24px 0;"><a href="${link}" style="background:#0B1F3B; color:#fff; padding:12px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">Review in Super Admin</a></p>
    <p style="font-size:13px; color:#6b7280;">If they change their mind before then, they can withdraw the request and the archive is cancelled.</p>`);
  const text = `${d.academy.name} has cancelled their subscription and asked for the academy to be deleted.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${billingLine}\n\n${archiveLine}\n\nReview: ${link}\n\nIf they change their mind before then, they can withdraw the request and the archive is cancelled.`;
  return sendToAll(recipients, subject, html, text);
}

export async function notifyPlatformOfArchive(academy: Academy, billingStopped: boolean): Promise<NotifyResult> {
  const recipients = await platformRecipients();
  if (recipients.length === 0) return { recipients: 0, delivered: 0 };
  const warn = billingStopped ? "" : " WARNING: its Stripe subscription could not be cancelled automatically — please cancel it in the Stripe Dashboard so no further payments are taken.";
  const msg = `${academy.name} (/a/${academy.slug}) has been archived automatically, 24 hours after it cancelled. It is hidden from learners and staff and its data is kept; restore it from Super Admin → Academies → Deleted academies if needed.${warn}`;
  const subject = `Archived: ${academy.name}`;
  const html = wrap(`<p>${escapeHtml(msg)}</p>`);
  return sendToAll(recipients, subject, html, msg);
}

export async function notifyPlatformOfWithdrawal(d: Pick<CancellationDetails, "academy" | "requesterName" | "requesterEmail" | "origin">): Promise<NotifyResult> {
  const recipients = await platformRecipients();
  if (recipients.length === 0) return { recipients: 0, delivered: 0 };
  const subject = `Cancellation withdrawn: ${d.academy.name}`;
  const msg = `${d.requesterName} (${d.requesterEmail}) has withdrawn the request to cancel and delete ${d.academy.name}. Billing has been switched back on and the scheduled archive is cancelled, so please do not delete the academy.`;
  const html = wrap(`<p>${escapeHtml(msg)}</p><p><a href="${d.origin}/super-admin/academies">Open Super Admin</a></p>`);
  return sendToAll(recipients, subject, html, `${msg}\n\n${d.origin}/super-admin/academies`);
}

export async function sendRequesterReceipt(d: CancellationDetails): Promise<void> {
  const payments =
    d.billing === "stopped"
      ? "We have switched off your subscription, so no further payments will be taken."
      : "You were on the free trial, so no payment will be taken.";
  const archive = `Your academy will be archived automatically at ${dateTimeText(d.academy.cancellation_archive_at)} (24 hours after your request): it will be hidden from your learners and staff, and the SkillsAcademy.ai team will then delete it.`;
  const subject = `We've received your request to cancel ${d.academy.name}`;
  const html = wrap(`
    <p>Hi ${escapeHtml(d.requesterName)},</p>
    <p>We've received your request to cancel <strong>${escapeHtml(d.academy.name)}</strong> and have it deleted.</p>
    <p>${escapeHtml(payments)}</p>
    <p>${escapeHtml(archive)}</p>
    <p>If you change your mind before then, open Billing in your academy admin area and withdraw the request.</p>`);
  const text = `Hi ${d.requesterName},\n\nWe've received your request to cancel ${d.academy.name} and have it deleted.\n\n${payments}\n\n${archive}\n\nIf you change your mind before then, open Billing in your academy admin area and withdraw the request.`;
  await sendEmail({ to: d.requesterEmail, subject, html, text });
}

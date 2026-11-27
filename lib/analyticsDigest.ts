// The weekly engagement email sent to each academy's admins. Run by the Netlify scheduled function
// netlify/functions/weekly-digest.mjs -> /api/cron/weekly-digest. Each academy is emailed at most once
// every 6 days (analytics_digest_sent_at), so a retried or doubled schedule never sends twice.
import { queryAll, exec, nowIso } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { courseStats, overview, rangeFrom, pct, type CourseStat, type Overview } from "@/lib/analytics";

export interface DigestContent {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildDigest(academyName: string, link: string, o: Overview, courses: CourseStat[]): DigestContent {
  const needAttention = courses
    .filter((c) => c.enrolled > 0 && c.stalled > 0)
    .sort((a, b) => b.stalled - a.stalled)
    .slice(0, 3);
  const top = courses.filter((c) => c.newEnrolments > 0).sort((a, b) => b.newEnrolments - a.newEnrolments).slice(0, 3);
  const lines = [
    `${o.activeLearners} of ${o.learners} learners were active`,
    `${o.enrolmentsNew} new enrolment${o.enrolmentsNew === 1 ? "" : "s"}`,
    `${o.moduleCompletions} module${o.moduleCompletions === 1 ? "" : "s"} completed`,
    `${o.certificates} certificate${o.certificates === 1 ? "" : "s"} issued`,
    `${o.inactiveLearners} learner${o.inactiveLearners === 1 ? "" : "s"} with unfinished courses have gone quiet (14+ days)`,
  ];
  const needText = needAttention.map((c) => `  - ${c.title}: ${c.stalled} stalled of ${c.enrolled} (${pct(c.completed, c.enrolled)}% finished)`);
  const topText = top.map((c) => `  - ${c.title}: ${c.newEnrolments} new`);
  const text = [
    `Your week at ${academyName}`,
    "",
    ...lines.map((l) => `* ${l}`),
    ...(top.length ? ["", "Most popular courses this week:", ...topText] : []),
    ...(needAttention.length ? ["", "Courses where learners have stalled:", ...needText] : []),
    "",
    `Full reports: ${link}`,
    "",
    "You get this email every Monday. You can switch it off on the Analytics page.",
  ].join("\n");
  const li = (s: string) => `<li style="margin:2px 0">${esc(s)}</li>`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#111827;max-width:560px">` +
    `<h2 style="margin:0 0 8px">Your week at ${esc(academyName)}</h2><ul style="padding-left:18px">${lines.map(li).join("")}</ul>` +
    (top.length ? `<p style="margin:14px 0 4px"><strong>Most popular courses this week</strong></p><ul style="padding-left:18px">${top.map((c) => li(`${c.title}: ${c.newEnrolments} new`)).join("")}</ul>` : "") +
    (needAttention.length
      ? `<p style="margin:14px 0 4px"><strong>Courses where learners have stalled</strong></p><ul style="padding-left:18px">${needAttention.map((c) => li(`${c.title}: ${c.stalled} stalled of ${c.enrolled}`)).join("")}</ul>`
      : "") +
    `<p style="margin:18px 0"><a href="${esc(link)}" style="background:#111827;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open your analytics</a></p>` +
    `<p style="font-size:12px;color:#6b7280">You get this email every Monday. You can switch it off on the Analytics page.</p></div>`;
  return { subject: `Your week at ${academyName}: ${o.activeLearners} active learners, ${o.moduleCompletions} modules completed`, text, html };
}

/** The digest for one academy for the last 7 days. */
export async function digestFor(academy: { id: string; name: string; slug: string }, origin: string): Promise<DigestContent> {
  const from = rangeFrom("7d");
  const [o, courses] = await Promise.all([overview(academy.id, from), courseStats(academy.id, from)]);
  return buildDigest(academy.name, `${origin}/a/${academy.slug}/admin/analytics`, o, courses);
}

export async function sendWeeklyDigests(origin: string, now = new Date()): Promise<{ academies: number; emails: number }> {
  const due = new Date(now.getTime() - 6 * 86_400_000).toISOString();
  const academies = await queryAll<{ id: string; name: string; slug: string }>(
    `SELECT id, name, slug FROM academies
      WHERE is_deleted = 0 AND analytics_digest = 1 AND (analytics_digest_sent_at IS NULL OR analytics_digest_sent_at < $1)
        AND EXISTS (SELECT 1 FROM users u WHERE u.academy_id = academies.id AND u.role = 'LEARNER')`,
    [due]
  );
  let emails = 0;
  for (const a of academies) {
    // Claim the academy first so two overlapping runs can't both send.
    const claimed = await queryAll<{ id: string }>(
      "UPDATE academies SET analytics_digest_sent_at = $2 WHERE id = $1 AND (analytics_digest_sent_at IS NULL OR analytics_digest_sent_at < $3) RETURNING id",
      [a.id, nowIso(), due]
    );
    if (claimed.length === 0) continue;
    const admins = await queryAll<{ email: string }>("SELECT email FROM users WHERE academy_id = $1 AND role = 'ACADEMY_ADMIN' AND is_active = 1", [a.id]);
    if (admins.length === 0) continue;
    const mail = await digestFor(a, origin);
    for (const admin of admins) {
      const r = await sendEmail({ to: admin.email, subject: mail.subject, html: mail.html, text: mail.text });
      if (r.ok) emails++;
    }
  }
  return { academies: academies.length, emails };
}

export async function setDigest(academyId: string, on: boolean): Promise<void> {
  await exec("UPDATE academies SET analytics_digest = $2 WHERE id = $1", [academyId, on ? 1 : 0]);
}

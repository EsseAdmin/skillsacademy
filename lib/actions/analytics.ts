"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/authz";
import { Academies, Users } from "@/lib/queries";
import { digestFor, setDigest } from "@/lib/analyticsDigest";
import { sendEmail } from "@/lib/email";
import { currentOrigin } from "@/lib/requestOrigin";

export async function setAnalyticsDigest(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  await setDigest(session.academyId!, String(formData.get("on") || "") === "1");
  revalidatePath(`/a/${slug}/admin/analytics`);
}

// "Email me this week's summary now": goes to the person who clicked, never to anyone else.
export async function sendMeTheDigest(slug: string) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  const me = await Users.byId(session.userId);
  if (!academy || !me) redirect(`/a/${slug}/admin/analytics`);
  const mail = await digestFor(academy, await currentOrigin());
  const r = await sendEmail({ to: me.email, subject: mail.subject, html: mail.html, text: mail.text });
  redirect(`/a/${slug}/admin/analytics?digest=${r.ok ? "sent" : "failed"}`);
}

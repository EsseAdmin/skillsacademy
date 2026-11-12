"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Academies, Users, SuperAdmins } from "@/lib/queries";
import { verifyPassword, setSessionCookie, clearSessionCookie, setPendingCookie, readPendingCookie, clearPendingCookie } from "@/lib/auth";
import { twoFactorRequired, issueLoginCode, checkLoginCode } from "@/lib/superAdminTwoFactor";
import { safeLearnerNext } from "@/lib/nextPath";
import { ROLE_HOME } from "@/lib/roleHome";
import { getT, normalizeLang } from "@/lib/i18n";
import { saHref } from "@/lib/superAdminPath";

export type FormState = { error?: string; info?: string } | undefined;

export async function tenantLogin(slug: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const academy = await Academies.bySlug(slug);
  if (!academy) return { error: getT()("err_academy_not_found") };
  const t = getT(academy.language);

  const user = await Users.byAcademyAndEmail(academy.id, email);
  if (!user || !user.is_active) return { error: t("err_bad_login") };

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { error: t("err_bad_login") };

  // Note: login is intentionally NOT gated on user.email_verified_at.
  // Verification links are still generated and emailed everywhere an
  // account is created (see lib/emailVerification.ts and its call sites)
  // and still mark the account verified when clicked, but nothing blocks
  // login on that state — this was a deliberate product decision to turn
  // the capability off after it initially shipped as blocking. To make
  // login blocking again, reinstate a check here against
  // `user.email_verified_at` (git history has the exact prior version).

  await setSessionCookie({
    userId: user.id,
    role: user.role,
    academyId: academy.id,
    academySlug: academy.slug,
    name: user.name,
    email: user.email,
  });

  // Learners coming from a course page go back to where they were headed.
  const next = user.role === "LEARNER" ? safeLearnerNext(slug, formData.get("next")) : null;
  redirect(next ?? `/a/${slug}/${ROLE_HOME[user.role]}`);
}

export async function superAdminLogin(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const admin = await SuperAdmins.byEmail(email);
  if (!admin) return { error: "Invalid email or password." };

  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) return { error: "Invalid email or password." };

  if (twoFactorRequired()) {
    const issued = await issueLoginCode(admin);
    if (!issued.ok) return { error: issued.error };
    await setPendingCookie(admin.id, issued.challengeId);
    redirect(saHref("/super-admin/login/verify"));
  }

  await startSuperAdminSession(admin);
  redirect(saHref("/super-admin"));
}

async function startSuperAdminSession(admin: { id: string; name: string; email: string }) {
  await clearPendingCookie();
  await setSessionCookie({
    userId: admin.id,
    role: "SUPER_ADMIN",
    academyId: null,
    academySlug: null,
    name: admin.name,
    email: admin.email,
  });
}

/** Step two of the Super Admin sign-in: the 6-digit code that was emailed. */
export async function superAdminVerifyCode(_prevState: FormState, formData: FormData): Promise<FormState> {
  const pending = await readPendingCookie();
  if (!pending) redirect(saHref("/super-admin/login"));
  const admin = await SuperAdmins.byId(pending.adminId);
  if (!admin) redirect(saHref("/super-admin/login"));
  const result = await checkLoginCode(admin.id, pending.challengeId, String(formData.get("code") || ""));
  if (!result.ok) {
    if (result.expired) {
      await clearPendingCookie();
      redirect(saHref("/super-admin/login") + "?expired=1");
    }
    return { error: result.error };
  }
  await startSuperAdminSession(admin);
  redirect(saHref("/super-admin"));
}

/** "Send a new code" on the code screen. */
export async function superAdminResendCode(_prevState: FormState): Promise<FormState> {
  const pending = await readPendingCookie();
  if (!pending) redirect(saHref("/super-admin/login"));
  const admin = await SuperAdmins.byId(pending.adminId);
  if (!admin) redirect(saHref("/super-admin/login"));
  const issued = await issueLoginCode(admin);
  if (!issued.ok) return { error: issued.error };
  await setPendingCookie(admin.id, issued.challengeId);
  return { info: "A new code has been emailed." };
}

export async function logout(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") || "/");
  await clearSessionCookie();
  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function findAcademyAndRedirect(_prevState: FormState, formData: FormData): Promise<FormState> {
  const query = String(formData.get("slug") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  if (!query) return { error: "Enter your academy's web address." };
  const academy = await Academies.bySlug(query);
  if (!academy) return { error: `We couldn't find an academy at "${query}".` };
  redirect(`/a/${academy.slug}/login`);
}

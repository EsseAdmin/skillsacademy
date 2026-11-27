import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates } from "@/lib/queries";
import { getT, normalizeLang } from "@/lib/i18n";
import { themeVars } from "@/lib/theme";
import { contrastTextColor } from "@/lib/color";
import { resendVerificationEmail } from "@/lib/actions/emailVerification";
import ResendVerificationForm from "@/components/ResendVerificationForm";

// Reached two ways:
//  - ?error=... — bounced back here by the confirm route handler
//    (app/a/[slug]/verify-email/confirm/route.ts) after an invalid,
//    expired, or already-used token.
//  - no params — someone came here directly to (re)send a verification
//    link, e.g. from their account settings.
// The email link itself points at the confirm route, not this page —
// actually consuming a token has to set a session cookie, which Next.js
// only allows from a Server Action or Route Handler, never a plain page's
// render. This page is purely the human-facing "here's what's going on,
// and here's how to get a new link" surface.
//
// Note: verifying an email is optional, not required to log in (see
// lib/actions/auth.ts#tenantLogin) — this page exists so the capability
// still works for anyone who wants to use it, not as a gate.
export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error: errorCode } = await searchParams;
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const template = (await Templates.byId(academy.template_id))!;
  const action = resendVerificationEmail.bind(null, slug);
  const errorKeys = { expired: "verify_err_expired", invalid: "verify_err_invalid", missing: "verify_err_missing" } as const;
  const error = errorCode ? t(errorKeys[errorCode as keyof typeof errorKeys] ?? "verify_err_invalid") : null;

  return (
    <div lang={lang} className="min-h-screen grid md:grid-cols-2" style={themeVars(template)}>
      <div
        className="hidden md:flex flex-col justify-between p-12"
        style={{
          background: `linear-gradient(160deg, ${template.primary_color}, ${template.secondary_color})`,
          color: contrastTextColor(template.primary_color),
        }}
      >
        <Link href={`/a/${slug}`} className="text-sm font-semibold tracking-wide opacity-80 hover:opacity-100" data-testid="back-to-academy">
          {t("back_to_home", { name: academy.name })}
        </Link>
        <div>
          <div className="text-3xl font-bold mb-3">{academy.logo_text}</div>
          <p className="opacity-70 max-w-sm text-sm leading-relaxed">{t("verify_side")}</p>
        </div>
        <div className="text-xs opacity-50">{t("powered_by")} SkillsAcademy.ai</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* The left panel is hidden on phones, so the way back to the academy's home page is repeated here. */}
          <Link href={`/a/${slug}`} className="md:hidden app-link text-sm font-semibold inline-block mb-6" data-testid="back-to-academy-mobile">
            {t("back_to_home", { name: academy.name })}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("verify_title")}</h1>
          <p className="text-sm text-gray-500 mb-8">{t("reset_for", { name: academy.name })}</p>

          {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

          <p className="text-sm text-gray-500 mb-4">{t("verify_request")}</p>
          <ResendVerificationForm action={action} lang={lang} />

          <p className="text-sm text-gray-400 mt-8">
            <Link href={`/a/${slug}/login`} className="app-link font-medium">
              {t("back_to_login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

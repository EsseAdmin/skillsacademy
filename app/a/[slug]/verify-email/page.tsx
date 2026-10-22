import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { contrastTextColor } from "@/lib/color";
import { resendVerificationEmail } from "@/lib/actions/emailVerification";
import ResendVerificationForm from "@/components/ResendVerificationForm";

const ERROR_MESSAGES: Record<string, string> = {
  expired: "This verification link is invalid or has expired. Request a new one below.",
  invalid: "This verification link is invalid. Request a new one below.",
  missing: "That link is missing its verification token. Request a new one below.",
};

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
  const template = (await Templates.byId(academy.template_id))!;
  const action = resendVerificationEmail.bind(null, slug);
  const error = errorCode ? ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.invalid : null;

  return (
    <div className="min-h-screen grid md:grid-cols-2" style={themeVars(template)}>
      <div
        className="hidden md:flex flex-col justify-between p-12"
        style={{
          background: `linear-gradient(160deg, ${template.primary_color}, ${template.secondary_color})`,
          color: contrastTextColor(template.primary_color),
        }}
      >
        <Link href="/" className="text-sm font-semibold tracking-wide opacity-80">
          ← SkillsAcademy.ai
        </Link>
        <div>
          <div className="text-3xl font-bold mb-3">{academy.logo_text}</div>
          <p className="opacity-70 max-w-sm text-sm leading-relaxed">Confirm your email address for your account.</p>
        </div>
        <div className="text-xs opacity-50">Powered by SkillsAcademy.ai</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Verify your email</h1>
          <p className="text-sm text-gray-500 mb-8">for {academy.name}</p>

          {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">{error}</div>}

          <p className="text-sm text-gray-500 mb-4">Request a link to confirm your email address:</p>
          <ResendVerificationForm action={action} />

          <p className="text-sm text-gray-400 mt-8">
            <Link href={`/a/${slug}/login`} className="app-link font-medium">
              ← Back to log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

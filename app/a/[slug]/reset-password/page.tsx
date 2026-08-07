import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { resetPassword } from "@/lib/actions/passwordReset";
import ResetPasswordForm from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const action = resetPassword.bind(null, slug);

  return (
    <div className="min-h-screen grid md:grid-cols-2" style={themeVars(template)}>
      <div
        className="hidden md:flex flex-col justify-between p-12 text-white"
        style={{ background: `linear-gradient(160deg, ${template.primary_color}, ${template.secondary_color})` }}
      >
        <Link href="/" className="text-sm font-semibold tracking-wide opacity-80">
          ← SkillsAcademy.ai
        </Link>
        <div>
          <div className="text-3xl font-bold mb-3">{academy.logo_text}</div>
          <p className="opacity-70 max-w-sm text-sm leading-relaxed">Choose a new password to get back into your account.</p>
        </div>
        <div className="text-xs opacity-50">Powered by SkillsAcademy.ai</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Set a new password</h1>
          <p className="text-sm text-gray-500 mb-8">for {academy.name}</p>
          {token ? (
            <ResetPasswordForm action={action} token={token} />
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This page needs a reset link from your email —{" "}
              <Link href={`/a/${slug}/forgot-password`} className="font-medium underline">
                request one here
              </Link>
              .
            </div>
          )}
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

import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates } from "@/lib/queries";
import { getT, normalizeLang } from "@/lib/i18n";
import { themeVars } from "@/lib/theme";
import { contrastTextColor } from "@/lib/color";
import { requestPasswordReset } from "@/lib/actions/passwordReset";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export default async function ForgotPasswordPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const template = (await Templates.byId(academy.template_id))!;
  const action = requestPasswordReset.bind(null, slug);

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
          <p className="opacity-70 max-w-sm text-sm leading-relaxed">{t("forgot_side")}</p>
        </div>
        <div className="text-xs opacity-50">{t("powered_by")} SkillsAcademy.ai</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* The left panel is hidden on phones, so the way back to the academy's home page is repeated here. */}
          <Link href={`/a/${slug}`} className="md:hidden app-link text-sm font-semibold inline-block mb-6" data-testid="back-to-academy-mobile">
            {t("back_to_home", { name: academy.name })}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("forgot_title")}</h1>
          <p className="text-sm text-gray-900 mb-8">
            {t("forgot_intro", { name: academy.name })}
          </p>
          <ForgotPasswordForm action={action} lang={lang} />
          <p className="text-sm text-gray-900 mt-8">
            <Link href={`/a/${slug}/login`} className="app-link font-medium">
              {t("back_to_login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates } from "@/lib/queries";
import { getT, normalizeLang } from "@/lib/i18n";
import { themeVars } from "@/lib/theme";
import { contrastTextColor } from "@/lib/color";
import { tenantLogin } from "@/lib/actions/auth";
import LoginForm from "@/components/LoginForm";
import { safeLearnerNext } from "@/lib/nextPath";

export default async function TenantLoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string }> }) {
  const { slug } = await params;
  const next = safeLearnerNext(slug, (await searchParams).next) ?? undefined;
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const template = (await Templates.byId(academy.template_id))!;
  const action = tenantLogin.bind(null, slug);

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
          <p className="opacity-70 max-w-sm text-sm leading-relaxed">
            {t("login_side")}
          </p>
        </div>
        <div className="text-xs opacity-50">{t("powered_by")} SkillsAcademy.ai</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* The left panel is hidden on phones, so the way back to the academy's home page is repeated here. */}
          <Link href={`/a/${slug}`} className="md:hidden app-link text-sm font-semibold inline-block mb-6" data-testid="back-to-academy-mobile">
            {t("back_to_home", { name: academy.name })}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("login_title")}</h1>
          <p className="text-sm text-gray-900 mb-8">{t("login_to", { name: academy.name })}</p>
          <LoginForm action={action} forgotPasswordHref={`/a/${slug}/forgot-password`} next={next} lang={lang} />
          <p className="text-sm text-gray-900 mt-4">
            {t("login_new_learner")}{" "}
            <Link href={next ? `/a/${slug}/register?next=${next}` : `/a/${slug}/register`} className="app-link font-semibold">
              {t("login_create_account")}
            </Link>
          </p>
          <p className="text-sm text-gray-900 mt-4">
            {t("login_not_right")}{" "}
            <Link href="/login" className="app-link font-semibold">
              {t("login_find_academy")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

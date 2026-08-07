import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { tenantLogin } from "@/lib/actions/auth";
import LoginForm from "@/components/LoginForm";

export default async function TenantLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const action = tenantLogin.bind(null, slug);

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
          <p className="opacity-70 max-w-sm text-sm leading-relaxed">
            Sign in to access your courses, manage learners, or run your academy — all in one place.
          </p>
        </div>
        <div className="text-xs opacity-50">Powered by SkillsAcademy.ai</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
          <p className="text-sm text-gray-500 mb-8">Log in to {academy.name}</p>
          <LoginForm action={action} forgotPasswordHref={`/a/${slug}/forgot-password`} />
          <p className="text-sm text-gray-400 mt-4">
            New learner?{" "}
            <Link href={`/a/${slug}/register`} className="app-link font-medium">
              Create an account
            </Link>
          </p>
          <p className="text-sm text-gray-400 mt-4">
            Not the right academy?{" "}
            <Link href="/login" className="app-link font-medium">
              Find your academy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

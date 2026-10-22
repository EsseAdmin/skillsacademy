import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { contrastTextColor } from "@/lib/color";
import { registerLearner } from "@/lib/actions/register";
import RegisterForm from "@/components/RegisterForm";
import { safeLearnerNext } from "@/lib/nextPath";

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string }> }) {
  const { slug } = await params;
  const next = safeLearnerNext(slug, (await searchParams).next) ?? undefined;
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const action = registerLearner.bind(null, slug);

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
          <p className="opacity-70 max-w-sm text-sm leading-relaxed">
            Create your own account to browse courses, enrol, and track your progress at {academy.name}.
          </p>
        </div>
        <div className="text-xs opacity-50">Powered by SkillsAcademy.ai</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-900 mb-8">Join {academy.name} as a learner</p>
          <RegisterForm action={action} next={next} />
          <p className="text-sm text-gray-900 mt-8">
            Already have an account?{" "}
            <Link href={next ? `/a/${slug}/login?next=${next}` : `/a/${slug}/login`} className="app-link font-medium">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { registerLearner } from "@/lib/actions/register";
import RegisterForm from "@/components/RegisterForm";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const action = registerLearner.bind(null, slug);

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
            Create your own account to browse courses, enrol, and track your progress at {academy.name}.
          </p>
        </div>
        <div className="text-xs opacity-50">Powered by SkillsAcademy.ai</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-8">Join {academy.name} as a learner</p>
          <RegisterForm action={action} />
          <p className="text-sm text-gray-400 mt-8">
            Already have an account?{" "}
            <Link href={`/a/${slug}/login`} className="app-link font-medium">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

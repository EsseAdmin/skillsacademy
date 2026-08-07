import Link from "next/link";
import { superAdminLogin } from "@/lib/actions/auth";
import LoginForm from "@/components/LoginForm";

export default function SuperAdminLoginPage() {
  return (
    <div
      className="min-h-screen grid md:grid-cols-2"
      style={{ ["--brand-primary" as never]: "#0B1F3B", ["--brand-accent" as never]: "#FBCB07" }}
    >
      <div className="hidden md:flex flex-col justify-between p-12 text-white bg-[#0B1F3B]">
        <Link href="/" className="text-sm font-semibold tracking-wide opacity-80">
          ← SkillsAcademy.ai
        </Link>
        <div>
          <div className="text-3xl font-bold mb-3">Platform Admin</div>
          <p className="opacity-70 max-w-sm text-sm leading-relaxed">
            Manage every academy on SkillsAcademy.ai — subscriptions, pricing, templates, and platform-wide
            settings.
          </p>
        </div>
        <div className="text-xs opacity-50">Restricted access</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Super Admin Login</h1>
          <p className="text-sm text-gray-500 mb-8">SkillsAcademy.ai platform administration</p>
          <LoginForm action={superAdminLogin} />
        </div>
      </div>
    </div>
  );
}

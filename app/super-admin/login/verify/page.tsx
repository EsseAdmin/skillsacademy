import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { readPendingCookie } from "@/lib/auth";
import { SuperAdmins } from "@/lib/queries";
import { saHref } from "@/lib/superAdminPath";
import { maskEmail, codeRecipient, CODE_MINUTES } from "@/lib/superAdminTwoFactor";
import { superAdminVerifyCode, superAdminResendCode } from "@/lib/actions/auth";
import SuperAdminCodeForm from "@/components/SuperAdminCodeForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Platform Admin", robots: { index: false, follow: false } };

export default async function SuperAdminVerifyPage() {
  const pending = await readPendingCookie();
  if (!pending) redirect(saHref("/super-admin/login"));
  const admin = await SuperAdmins.byId(pending.adminId);
  if (!admin) redirect(saHref("/super-admin/login"));
  return (
    <div
      className="min-h-screen flex items-center justify-center p-8"
      style={{ ["--brand-primary" as never]: "#0B1F3B", ["--brand-accent" as never]: "#FBCB07", ["--brand-primary-contrast" as never]: "#ffffff", ["--brand-link" as never]: "#0B1F3B" }}
    >
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Check your email</h1>
        <p className="text-sm text-gray-600 mb-8" data-testid="sa-code-hint">
          We sent a 6-digit code to {maskEmail(codeRecipient(admin.email))}. It works for {CODE_MINUTES} minutes.
        </p>
        <SuperAdminCodeForm verify={superAdminVerifyCode} resend={superAdminResendCode} />
        <p className="mt-8 text-xs text-gray-500"><a href={saHref("/super-admin/login")} className="app-link">← Back to sign in</a></p>
      </div>
    </div>
  );
}

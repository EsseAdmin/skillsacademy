import Link from "next/link";
import type { Academy } from "@/lib/queries";
import { daysRemaining, isTrialActive } from "@/lib/utils";

export default function TrialBanner({ academy, slug, showManage }: { academy: Academy; slug: string; showManage: boolean }) {
  if (academy.subscription_status === "active") return null;
  const active = isTrialActive(academy.trial_ends_at);
  const days = daysRemaining(academy.trial_ends_at);

  return (
    <div
      className={`px-8 py-2.5 text-sm flex items-center justify-between ${
        active ? "bg-amber-50 text-amber-800 border-b border-amber-200" : "bg-red-50 text-red-800 border-b border-red-200"
      }`}
    >
      <span>
        {active
          ? `You're on a free trial — ${days} day${days === 1 ? "" : "s"} remaining.`
          : "Your free trial has ended. Subscribe to keep full access to your academy."}
      </span>
      {showManage && (
        <Link href={`/a/${slug}/admin/billing`} className="font-semibold underline">
          Manage billing →
        </Link>
      )}
    </div>
  );
}

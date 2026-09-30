import { requireSuperAdminSession } from "@/lib/authz";
import { Plans } from "@/lib/queries";
import PortalShell from "@/components/PortalShell";
import { SUPER_ADMIN_NAV } from "@/lib/nav";
import { updatePlan, deletePlan } from "@/lib/actions/superadmin";
import CreatePlanForm from "@/components/CreatePlanForm";
import SyncStripeButton from "@/components/SyncStripeButton";

export default async function SuperAdminPlansPage() {
  const session = await requireSuperAdminSession();
  const plans = await Plans.all();

  return (
    <PortalShell
      brandName="SkillsAcademy.ai"
      brandTag="Platform Admin"
      themeStyle={{ ["--brand-primary" as never]: "#0B1F3B", ["--brand-secondary" as never]: "#12294d", ["--brand-accent" as never]: "#FBCB07" }}
      navItems={SUPER_ADMIN_NAV}
      activeHref="/super-admin/plans"
      userName={session.name}
      userRoleLabel="Super Admin"
      logoutRedirect="/super-admin/login"
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Subscription Plans</h1>
      <p className="text-gray-500 text-sm mb-8">Edit pricing, limits and features for every plan on the platform.</p>

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-1">Stripe billing</h2>
        <p className="text-xs text-gray-500 mb-4">
          Provisions a real Stripe Product + Price for every active plan below, so academies can actually pay for them. Safe to
          re-run after changing a price — see the <a href="/super-admin/payouts" className="app-link">Payouts</a> page for
          getting that money into your bank account.
        </p>
        <SyncStripeButton />
      </div>

      <div className="space-y-6 mb-10">
        {plans.map((p) => {
          const features: string[] = JSON.parse(p.features_json);
          return (
            <form key={p.id} action={updatePlan} className="app-card p-6">
              <input type="hidden" name="planId" value={p.id} />
              <div className="mb-4">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                    p.stripe_price_id ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {p.stripe_price_id ? "✓ Synced to Stripe" : "Not synced to Stripe yet"}
                </span>
              </div>
              <div className="grid md:grid-cols-4 gap-4 mb-4">
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                  Name
                  <input name="name" defaultValue={p.name} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                  Price (£/mo)
                  <input name="price" type="number" step="0.01" defaultValue={(p.price_pence / 100).toFixed(2)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                  Trial days
                  <input name="trial_days" type="number" defaultValue={p.trial_days} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-5">
                  <input type="checkbox" name="is_active" defaultChecked={!!p.is_active} /> Active (visible on marketing site)
                </label>
              </div>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                  Max learners (blank = unlimited)
                  <input name="max_learners" type="number" defaultValue={p.max_learners ?? ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                  Max instructors
                  <input name="max_instructors" type="number" defaultValue={p.max_instructors ?? ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                  Max courses
                  <input name="max_courses" type="number" defaultValue={p.max_courses ?? ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="text-xs font-semibold text-gray-600 grid gap-1.5 mb-4">
                Features (one per line)
                <textarea name="features" rows={4} defaultValue={features.join("\n")} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <div className="flex gap-3">
                <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
                  Save Plan
                </button>
              </div>
            </form>
          );
        })}
      </div>

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Danger zone</h2>
        <div className="flex flex-wrap gap-3">
          {plans.map((p) => (
            <form key={p.id} action={deletePlan}>
              <input type="hidden" name="planId" value={p.id} />
              <button type="submit" className="text-xs text-red-600 border border-red-200 rounded-md px-3 py-1.5 hover:bg-red-50">
                Delete &quot;{p.name}&quot;
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="app-card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Create a new plan</h2>
        <CreatePlanForm />
      </div>
    </PortalShell>
  );
}

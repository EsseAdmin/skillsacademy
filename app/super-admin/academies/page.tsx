import { requireSuperAdminSession } from "@/lib/authz";
import { Academies, Templates, Plans, Users, Courses } from "@/lib/queries";
import { formatGBP, formatDate } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import { SUPER_ADMIN_NAV } from "@/lib/nav";
import { deleteAcademy, restoreAcademy, updateAcademyBySuperAdmin } from "@/lib/actions/superadmin";

export default async function SuperAdminAcademiesPage() {
  const session = await requireSuperAdminSession();
  // Deleted academies no longer appear in the main list at all — they're
  // tucked away in a separate "Deleted academies" section below so the
  // underlying data (and the ability to restore) is still there without
  // cluttering the primary view.
  const allAcademies = await Academies.all(true);
  const academies = allAcademies.filter((a) => !a.is_deleted);
  const deletedAcademies = allAcademies.filter((a) => a.is_deleted);
  const templates = await Templates.all();
  const plans = await Plans.all();

  const withStats = async (list: typeof allAcademies) =>
    Promise.all(
      list.map(async (a) => {
        const plan = await Plans.byId(a.plan_id);
        const learners = (await Users.listByAcademy(a.id, "LEARNER")).length;
        const courses = (await Courses.listByAcademy(a.id)).length;
        return { academy: a, plan, learners, courses };
      })
    );

  const academiesWithStats = await withStats(academies);
  const deletedAcademiesWithStats = await withStats(deletedAcademies);
  const verifiedDomains = academiesWithStats.filter(({ academy: a }) => a.custom_domain && a.custom_domain_verified_at);

  return (
    <PortalShell
      brandName="SkillsAcademy.ai"
      brandTag="Platform Admin"
      themeStyle={{ ["--brand-primary" as never]: "#0B1F3B", ["--brand-secondary" as never]: "#12294d", ["--brand-accent" as never]: "#FBCB07" }}
      navItems={SUPER_ADMIN_NAV}
      activeHref="/super-admin/academies"
      userName={session.name}
      userRoleLabel="Super Admin"
      logoutRedirect="/super-admin/login"
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Academies</h1>
      <p className="text-gray-500 text-sm mb-8">{academies.length} academies.</p>

      {verifiedDomains.length > 0 && (
        <div className="app-card p-4 mb-6 bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <strong>{verifiedDomains.length}</strong> academy{verifiedDomains.length === 1 ? " has" : "ies have"} a
          verified custom domain waiting on the platform-side step: add each domain below to this site in Netlify
          (Domain management) so it actually resolves and gets SSL. Domains: {" "}
          {verifiedDomains.map(({ academy: a }) => a.custom_domain).join(", ")}.
        </div>
      )}

      <div className="space-y-4">
        {academiesWithStats.map(({ academy: a, plan, learners, courses }) => {
          return (
            <div key={a.id} className="app-card p-6">
              <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                <div>
                  <div className="font-bold text-gray-900 text-lg">{a.name}</div>
                  <div className="text-xs text-gray-500">
                    skillsacademy.ai/a/{a.slug} · {a.sector.replace("_", " ")} · created {formatDate(a.created_at)}
                  </div>
                  {a.custom_domain && (
                    <div className="text-xs mt-1">
                      Custom domain: <span className="font-mono">{a.custom_domain}</span>{" "}
                      {a.custom_domain_verified_at ? (
                        <span className="font-semibold text-emerald-600">— Verified ✓</span>
                      ) : (
                        <span className="font-semibold text-amber-600">— Pending verification</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-6 text-xs text-gray-500">
                  <span>{plan?.name || "—"} plan</span>
                  <span>{learners} learners</span>
                  <span>{courses} courses</span>
                  <span className="capitalize font-semibold text-gray-700">{a.subscription_status}</span>
                </div>
              </div>

              <form action={updateAcademyBySuperAdmin} className="flex flex-wrap gap-3 items-end mb-3">
                <input type="hidden" name="academyId" value={a.id} />
                <label className="text-xs font-semibold text-gray-600 grid gap-1">
                  Plan
                  <select name="plan_id" defaultValue={a.plan_id} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatGBP(p.price_pence)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600 grid gap-1">
                  Template
                  <select name="template_id" defaultValue={a.template_id} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600 grid gap-1">
                  Status
                  <select name="subscription_status" defaultValue={a.subscription_status} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
                    <option value="trialing">Trialing</option>
                    <option value="active">Active</option>
                    <option value="past_due">Past Due</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </label>
                <button type="submit" className="rounded-md px-4 py-1.5 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                  Save
                </button>
              </form>

              <div>
                <form action={deleteAcademy}>
                  <input type="hidden" name="academyId" value={a.id} />
                  <button type="submit" className="text-xs font-semibold text-red-600 hover:text-red-800">
                    Delete Academy
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        {academiesWithStats.length === 0 && <p className="text-sm text-gray-500">No academies yet.</p>}
      </div>

      {deletedAcademiesWithStats.length > 0 && (
        <details className="mt-10">
          <summary className="text-sm font-semibold text-gray-500 cursor-pointer select-none">
            Deleted academies ({deletedAcademiesWithStats.length})
          </summary>
          <p className="text-xs text-gray-400 mt-2 mb-4">
            Deleted academies are hidden from the list above and from learners/admins, but their data is kept —
            restore one here if it was removed by mistake.
          </p>
          <div className="space-y-4">
            {deletedAcademiesWithStats.map(({ academy: a, plan, learners, courses }) => (
              <div key={a.id} className="app-card p-6 opacity-60">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <div className="font-bold text-gray-900 text-lg">
                      {a.name} <span className="text-xs text-red-600 font-semibold ml-2">DELETED</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      skillsacademy.ai/a/{a.slug} · {a.sector.replace("_", " ")} · created {formatDate(a.created_at)}
                    </div>
                  </div>
                  <div className="flex gap-6 text-xs text-gray-500">
                    <span>{plan?.name || "—"} plan</span>
                    <span>{learners} learners</span>
                    <span>{courses} courses</span>
                  </div>
                </div>
                <form action={restoreAcademy}>
                  <input type="hidden" name="academyId" value={a.id} />
                  <button type="submit" className="text-xs font-semibold text-emerald-600 hover:text-emerald-800">
                    Restore Academy
                  </button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </PortalShell>
  );
}

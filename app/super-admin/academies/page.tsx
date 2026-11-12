import { requireSuperAdminSession } from "@/lib/authz";
import { archiveDueAcademies } from "@/lib/archiveCancelled";
import { Academies, Templates, Plans, Users, Courses } from "@/lib/queries";
import { aiUsageByAcademy, aiLimitForPlan } from "@/lib/aiUsage";
import { formatGBP, formatDate, formatDateTime } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { SUPER_ADMIN_NAV } from "@/lib/nav";
import { deleteAcademy, restoreAcademy, permanentlyDeleteAcademy, updateAcademyBySuperAdmin, grantComplimentary, revokeComplimentary } from "@/lib/actions/superadmin";
import { saHref } from "@/lib/superAdminPath";
import { complimentaryState } from "@/lib/complimentary";

export default async function SuperAdminAcademiesPage({ searchParams }: { searchParams: Promise<{ error?: string; complimentaryError?: string }> }) {
  const { error, complimentaryError } = await searchParams;
  const session = await requireSuperAdminSession();
  await archiveDueAcademies().catch(() => undefined);
  // Deleted academies no longer appear in the main list at all — they're
  // tucked away in a separate "Deleted academies" section below so the
  // underlying data (and the ability to restore) is still there without
  // cluttering the primary view.
  const allAcademies = await Academies.all(true);
  // Academies that asked to cancel come first so they can't be missed.
  const academies = allAcademies
    .filter((a) => !a.is_deleted)
    .sort((a, b) => Number(!!b.cancellation_requested_at) - Number(!!a.cancellation_requested_at));
  const deletedAcademies = allAcademies.filter((a) => a.is_deleted);
  const templates = await Templates.all();
  const plans = await Plans.all();
  const aiUsed = new Map((await aiUsageByAcademy()).map((r) => [r.academy_id, r.used]));

  const withStats = async (list: typeof allAcademies) =>
    Promise.all(
      list.map(async (a) => {
        const plan = await Plans.byId(a.plan_id);
        const learners = (await Users.listByAcademy(a.id, "LEARNER")).length;
        const courses = (await Courses.listByAcademy(a.id)).length;
        return { academy: a, plan, learners, courses, aiUsed: aiUsed.get(a.id) ?? 0, aiLimit: aiLimitForPlan(plan) };
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
      navItems={SUPER_ADMIN_NAV()}
      activeHref={saHref("/super-admin/academies")}
      userName={session.name}
      userRoleLabel="Super Admin"
      logoutRedirect={saHref("/super-admin/login")}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Academies</h1>
      <p className="text-gray-500 text-sm mb-8">{academies.length} academies.</p>

      {error === "delete_failed" && (
        <div className="app-card p-4 mb-6 bg-red-50 border border-red-200 text-sm text-red-700">
          That academy couldn&apos;t be permanently deleted, and nothing was removed. The reason is on the
          System check page under recent events.
        </div>
      )}

      {complimentaryError && (
        <div role="alert" className="app-card p-4 mb-6 bg-red-50 border border-red-200 text-sm text-red-700" data-testid="complimentary-error">
          Free access wasn&apos;t changed: {complimentaryError}
        </div>
      )}

      {error === "billing_not_stopped" && (
        <div className="app-card p-4 mb-6 bg-red-50 border border-red-200 text-sm text-red-700">
          The academy was deleted, but Stripe wouldn&apos;t confirm its subscription was cancelled. Cancel it in the Stripe
          Dashboard so no further payments are taken — the details are on the System check page.
        </div>
      )}

      {verifiedDomains.length > 0 && (
        <div className="app-card p-4 mb-6 bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <strong>{verifiedDomains.length}</strong> academy{verifiedDomains.length === 1 ? " has" : "ies have"} a
          verified custom domain waiting on the platform-side step: add each domain below to this site in Netlify
          (Domain management) so it actually resolves and gets SSL. Domains: {" "}
          {verifiedDomains.map(({ academy: a }) => a.custom_domain).join(", ")}.
        </div>
      )}

      <div className="space-y-4">
        {academiesWithStats.map(({ academy: a, plan, learners, courses, aiUsed: aiUsedNow, aiLimit }) => {
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
                  <span className={aiUsedNow >= aiLimit ? "font-semibold text-red-600" : ""}>AI {aiUsedNow}/{aiLimit} this month</span>
                  <span className="capitalize font-semibold text-gray-700">{a.subscription_status}</span>
                  {complimentaryState(a).active && (
                    <span className="font-semibold text-emerald-700" data-testid="complimentary-badge">
                      Complimentary{complimentaryState(a).unlimited ? " · no end" : ` · until ${formatDate(complimentaryState(a).until!)}`}
                    </span>
                  )}
                </div>
              </div>

              {(() => {
                const c = complimentaryState(a);
                return (
                  <details className="rounded-md border border-emerald-200 bg-emerald-50/50 px-4 py-3 mb-4" data-testid="complimentary-section">
                    <summary className="cursor-pointer select-none text-sm font-semibold text-emerald-900">
                      {c.active
                        ? c.unlimited
                          ? "Complimentary access — free with no end date"
                          : `Complimentary access — free until ${formatDate(c.until!)} (${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"} left)`
                        : c.expired
                          ? `Complimentary access ended ${formatDate(c.until!)} — grant again?`
                          : "Make this academy free (complimentary access)"}
                    </summary>
                    <div className="mt-3 text-xs text-gray-600 space-y-3">
                      <p>
                        While active, this academy sees no trial or payment prompts and can&apos;t start checkout. Its plan&apos;s limits still apply (set the plan above).
                        Nothing at Stripe is changed{a.stripe_subscription_id && a.subscription_status === "active" ? " — this academy has a live paid subscription, so cancel it in Stripe too if it should stop being charged" : ""}.
                        When a dated period ends the academy goes back to its normal trial / subscription state.
                      </p>
                      {c.granted && a.complimentary_note && <p className="italic">Note: {a.complimentary_note}</p>}
                      <form action={grantComplimentary} className="flex flex-wrap items-end gap-3">
                        <input type="hidden" name="academyId" value={a.id} />
                        <label className="font-semibold text-gray-700 grid gap-1">
                          How long
                          <select name="mode" defaultValue={c.active && !c.unlimited ? "until" : "unlimited"} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" data-testid="complimentary-mode">
                            <option value="unlimited">No end date (unlimited)</option>
                            <option value="until">Until a date</option>
                          </select>
                        </label>
                        <label className="font-semibold text-gray-700 grid gap-1">
                          End date (if &quot;until a date&quot;)
                          <input type="date" name="until" defaultValue={c.until ? c.until.slice(0, 10) : ""} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" data-testid="complimentary-until" />
                        </label>
                        <label className="font-semibold text-gray-700 grid gap-1 flex-1 min-w-[12rem]">
                          Note (only you see this)
                          <input name="note" maxLength={200} defaultValue={a.complimentary_note ?? ""} placeholder="e.g. Charity partner, agreed by Ardavan" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
                        </label>
                        <button type="submit" className="rounded-md px-4 py-1.5 text-sm font-semibold app-btn-primary" data-testid="complimentary-grant">
                          {c.active ? "Update free access" : "Grant free access"}
                        </button>
                      </form>
                      {c.granted && (
                        <form action={revokeComplimentary}>
                          <input type="hidden" name="academyId" value={a.id} />
                          <button type="submit" className="text-xs font-semibold text-red-600 hover:text-red-800" data-testid="complimentary-revoke">
                            Remove free access
                          </button>
                        </form>
                      )}
                    </div>
                  </details>
                );
              })()}

              {a.cancellation_requested_at && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 mb-4 text-sm text-red-900" data-testid="cancel-request">
                  <div className="font-semibold">Cancellation &amp; deletion requested {formatDate(a.cancellation_requested_at)}</div>
                  <div className="text-xs mt-1">
                    {a.cancellation_billing === "stopped" ? "Stripe renewals switched off — no further payments." : "No paid subscription to stop (free trial)."}
                    {a.cancellation_archive_at ? ` Auto-archives ${formatDateTime(a.cancellation_archive_at)}.` : ""}
                    {" "}
                    {a.cancellation_notified_at ? "Platform email sent." : "The platform email was not delivered — check the System check page."}
                  </div>
                  {a.cancellation_reason && <div className="text-xs mt-1 italic">Reason: {a.cancellation_reason}</div>}
                  <div className="text-xs mt-1">It archives itself automatically; you can also press <strong>Delete Academy</strong> below now. It can be restored until deleted permanently.</div>
                </div>
              )}

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
            restore one here if it was removed by mistake, or erase it for good if you&apos;re sure you won&apos;t
            need it back.
          </p>
          <div className="space-y-4">
            {deletedAcademiesWithStats.map(({ academy: a, plan, learners, courses }) => (
              <div key={a.id} className="app-card p-6 opacity-60">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <div className="font-bold text-gray-900 text-lg">
                      {a.name}{" "}
                      <span className="text-xs text-red-600 font-semibold ml-2" data-testid={a.cancellation_archived_at ? "archived-label" : undefined}>
                        {a.cancellation_archived_at ? "ARCHIVED AFTER CANCELLATION" : "DELETED"}
                      </span>
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
                <div className="flex gap-5">
                  <form action={restoreAcademy}>
                    <input type="hidden" name="academyId" value={a.id} />
                    <button type="submit" className="text-xs font-semibold text-emerald-600 hover:text-emerald-800">
                      Restore Academy
                    </button>
                  </form>
                  <form action={permanentlyDeleteAcademy}>
                    <input type="hidden" name="academyId" value={a.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Permanently delete "${a.name}"? This erases all its courses, modules, learners and data for good — it can no longer be restored.`}
                      className="text-xs font-semibold text-red-700 hover:text-red-900"
                    >
                      Delete Permanently
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </PortalShell>
  );
}

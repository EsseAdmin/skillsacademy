import { Academies, Templates, Modules } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell, { type NavItem } from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import AgentRequestForm, { type AgentModuleOption } from "@/components/AgentRequestForm";
import { isAiConfigured } from "@/lib/ai";
import { getAiUsage, recentAiUsage } from "@/lib/aiUsage";
import { AiDrafts, ACTION_LABEL, agentModulesFor, agentCoursesFor, fileKindOf, type DraftRow, type Proposal } from "@/lib/aiAgent";
import { approveAgentDraft, rejectAgentDraft, restoreAgentDraft } from "@/lib/actions/contentAgent";
import type { SessionPayload } from "@/lib/auth";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-gray-100 text-gray-600",
  RESTORED: "bg-blue-100 text-blue-800",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Waiting for review", APPROVED: "Approved & applied", REJECTED: "Rejected", RESTORED: "Restored to the previous version" };
const KIND_LABEL: Record<string, string> = { TEXT: "Written lesson", SLIDES: "PowerPoint deck", DOCUMENT: "Word handout" };

function parse(d: DraftRow): Proposal | null {
  try {
    return JSON.parse(d.proposal_json) as Proposal;
  } catch {
    return null;
  }
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

function Preview({ proposal, currentText }: { proposal: Proposal; currentText?: string | null }) {
  if (proposal.text !== undefined) {
    return (
      <div className={currentText ? "grid md:grid-cols-2 gap-3" : ""}>
        {currentText && (
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">Current</div>
            <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 rounded-md p-3 max-h-72 overflow-auto font-sans">{currentText}</pre>
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">Proposed</div>
          <pre className="whitespace-pre-wrap text-xs text-gray-800 bg-green-50 rounded-md p-3 max-h-72 overflow-auto font-sans">{proposal.text}</pre>
        </div>
      </div>
    );
  }
  if (proposal.slides) {
    return (
      <ol className="text-xs text-gray-700 grid gap-2 max-h-72 overflow-auto bg-green-50 rounded-md p-3 list-decimal list-inside">
        {proposal.slides.slides.map((s, i) => (
          <li key={i}>
            <span className="font-semibold">{s.title}</span>
            <ul className="list-disc ml-6 mt-0.5 text-gray-600">
              {s.bullets.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    );
  }
  if (proposal.document) {
    return (
      <div className="text-xs text-gray-700 grid gap-3 max-h-72 overflow-auto bg-green-50 rounded-md p-3">
        {proposal.document.intro && <p>{proposal.document.intro}</p>}
        {proposal.document.sections.map((s, i) => (
          <div key={i}>
            <div className="font-semibold">{s.heading}</div>
            {s.paragraphs.map((p, j) => (
              <p key={j} className="text-gray-600 mt-0.5">
                {p}
              </p>
            ))}
            {s.bullets.length > 0 && (
              <ul className="list-disc ml-5 text-gray-600 mt-0.5">
                {s.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export default async function ContentAgentPage({
  slug,
  area,
  session,
  navItems,
  notice,
  error,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  notice?: string;
  error?: string;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const academyId = academy.id;

  const [usage, recent, rawModules, courses, drafts] = await Promise.all([
    getAiUsage(academyId),
    recentAiUsage(academyId, 8),
    agentModulesFor(session),
    agentCoursesFor(session),
    AiDrafts.list(academyId, area === "instructor" ? { requestedBy: session.userId } : {}),
  ]);

  const modules: AgentModuleOption[] = rawModules.flatMap((m): AgentModuleOption[] => {
    if (m.content_type === "TEXT") return [{ id: m.id, title: m.title, kind: "TEXT" }];
    const fk = fileKindOf(m);
    return fk ? [{ id: m.id, title: m.title, kind: fk }] : [];
  });

  // Current text for pending rewrites, so the reviewer can compare. Looked up
  // by module id *within this academy* only.
  const currentText = new Map<string, string | null>();
  for (const d of drafts) {
    if (d.action === "IMPROVE_TEXT" && d.target_module_id && d.status === "PENDING") {
      const m = await Modules.byId(d.target_module_id);
      if (m && m.academy_id === academyId) currentText.set(d.id, m.content_text);
    }
  }

  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 100;
  const bar = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500";
  const resets = new Date(usage.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const pending = drafts.filter((d) => d.status === "PENDING");
  const history = drafts.filter((d) => d.status !== "PENDING");

  const approve = approveAgentDraft.bind(null, slug);
  const reject = rejectAgentDraft.bind(null, slug);
  const restore = restoreAgentDraft.bind(null, slug);

  const NOTICE: Record<string, string> = {
    approved: "Approved — the change has been applied.",
    rejected: "Rejected — nothing was changed.",
    restored: "Restored — the module is back to how it was before.",
  };

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={area === "admin" ? "Academy Admin" : "Instructor"}
      themeStyle={themeVars(template)}
      navItems={navItems}
      activeHref={`/a/${slug}/${area}/content-agent`}
      userName={session.name}
      userRoleLabel={area === "admin" ? "Academy Admin" : "Instructor"}
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={area === "admin" ? <TrialBanner academy={academy} slug={slug} showManage /> : undefined}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Content agent</h1>
      <p className="text-gray-500 text-sm mb-6 max-w-3xl">
        Your academy&apos;s content assistant. Ask it to improve a lesson, rebuild a PowerPoint or Word file, or draft a new
        module. It only ever writes <strong>drafts</strong>: nothing is changed, published, emailed, graded or deleted until a
        person approves it here. It works only with this academy&apos;s content.
      </p>

      {notice && NOTICE[notice] && <div className="mb-4 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3">{NOTICE[notice]}</div>}
      {error && <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="app-card p-5 mb-6 max-w-3xl">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="font-semibold text-gray-900 text-sm">AI usage this month</h2>
          <span className="text-xs text-gray-500">
            {usage.planName} plan · resets {resets}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden mb-2" role="progressbar" aria-valuenow={usage.used} aria-valuemin={0} aria-valuemax={usage.limit}>
          <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-gray-700">
          <strong>{usage.used}</strong> of <strong>{usage.limit}</strong> AI actions used · {usage.remaining} left
          <span className="text-xs text-gray-400"> · every AI request, slide deck or Word file counts as one action (this includes Generate with AI)</span>
        </p>
        {recent.length > 0 && (
          <details className="mt-3 text-xs text-gray-500">
            <summary className="cursor-pointer font-semibold text-gray-600">Recent AI activity</summary>
            <ul className="mt-2 grid gap-1">
              {recent.map((r) => (
                <li key={r.id}>
                  {fmt(r.created_at)} · {r.user_name ?? "System"} · {r.label ?? r.source}
                  {r.input_tokens + r.output_tokens > 0 ? ` · ${(r.input_tokens + r.output_tokens).toLocaleString("en-GB")} tokens` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="max-w-3xl mb-8">
        {isAiConfigured() ? (
          <AgentRequestForm slug={slug} modules={modules} courses={courses.map((c) => ({ id: c.id, title: c.title }))} remaining={usage.remaining} />
        ) : (
          <div className="app-card p-6">
            <h2 className="font-semibold text-gray-900 mb-2">AI isn&apos;t set up yet</h2>
            <p className="text-sm text-gray-600">The platform administrator needs to add an Anthropic API key before the agent can write drafts.</p>
          </div>
        )}
      </div>

      <h2 className="font-semibold text-gray-900 mb-3">Waiting for your review ({pending.length})</h2>
      {pending.length === 0 && <p className="text-sm text-gray-500 mb-8">No drafts waiting. Ask the agent for something above.</p>}
      <div className="grid gap-4 mb-10 max-w-4xl">
        {pending.map((d) => {
          const p = parse(d);
          return (
            <div key={d.id} className="app-card p-5">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-semibold text-gray-900">{d.title}</span>
                <span className="text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{ACTION_LABEL[d.action]}</span>
                <span className="text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{KIND_LABEL[d.kind]}</span>
                <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Asked {fmt(d.created_at)} — “{d.instruction}”
              </p>
              {p ? <Preview proposal={p} currentText={currentText.get(d.id)} /> : <p className="text-sm text-red-600">This draft is damaged — reject it and ask again.</p>}
              {d.action === "REBUILD_FILE" && <p className="text-xs text-gray-500 mt-3">Approving replaces this module&apos;s file with a newly built one. The old file is kept, and you can restore it afterwards.</p>}
              {d.action === "NEW_MODULE" && <p className="text-xs text-gray-500 mt-3">Approving creates this module{d.target_course_id ? " and adds it to the chosen course" : " in your modules library"}.</p>}
              <div className="flex gap-3 mt-4">
                <form action={approve}>
                  <input type="hidden" name="draftId" value={d.id} />
                  <button type="submit" disabled={!p} className="app-btn-primary rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60">
                    ✓ Approve &amp; apply
                  </button>
                </form>
                <form action={reject}>
                  <input type="hidden" name="draftId" value={d.id} />
                  <button type="submit" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      {history.length > 0 && (
        <>
          <h2 className="font-semibold text-gray-900 mb-3">Earlier drafts</h2>
          <div className="grid gap-2 max-w-4xl">
            {history.map((d) => (
              <div key={d.id} className="app-card px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{d.title}</div>
                  <div className="text-xs text-gray-500">
                    {ACTION_LABEL[d.action]} · {fmt(d.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                  {d.status === "APPROVED" && d.action !== "NEW_MODULE" && d.previous_json && (
                    <form action={restore}>
                      <input type="hidden" name="draftId" value={d.id} />
                      <ConfirmSubmitButton confirmMessage="Put this module back to how it was before this change?" className="text-xs font-semibold text-gray-700 underline">
                        Restore previous version
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </PortalShell>
  );
}

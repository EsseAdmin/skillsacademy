"use client";

import { useActionState, useState } from "react";
import { signupAcademy } from "@/lib/actions/signup";
import { generateSignupAcademyPlan } from "@/lib/actions/aiAcademy";
import { formatGBP } from "@/lib/utils";
import type { AcademyPlan } from "@/lib/ai";

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface Template {
  id: string;
  key: string;
  name: string;
  description: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
}
interface Plan {
  id: string;
  key: string;
  name: string;
  price_pence: number;
  trial_days: number;
  features_json: string;
}

const SECTORS = [
  { key: "business", label: "Business" },
  { key: "charity", label: "Charity / Community Org" },
  { key: "public_sector", label: "Public Sector / Government" },
];

export default function SignupWizard({
  templates,
  plans,
  initialPlan,
  aiEnabled,
}: {
  templates: Template[];
  plans: Plan[];
  initialPlan?: string;
  aiEnabled: boolean;
}) {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [sector, setSector] = useState("business");
  const [templateKey, setTemplateKey] = useState(templates[0]?.key || "");
  const [planKey, setPlanKey] = useState(initialPlan && plans.some((p) => p.key === initialPlan) ? initialPlan : plans[1]?.key || plans[0]?.key || "");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");

  const [state, formAction, pending] = useActionState(signupAcademy, undefined);

  // "Describe your academy" AI step — entirely optional. Generating a
  // plan only ever fills in step 1's org name/slug (if the admin hasn't
  // already typed their own) and, once the admin actually submits the
  // final form in step 4, adds the generated homepage copy/courses to the
  // real academy that gets created — see lib/actions/signup.ts.
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiState, aiFormAction, aiPending] = useActionState(generateSignupAcademyPlan, undefined);
  const [useAiTemplate, setUseAiTemplate] = useState(true);
  // Tracks which generated plan we've already reacted to, so the
  // pre-fill below runs exactly once per new plan rather than on every
  // render — following React's documented pattern for adjusting state in
  // response to a changing value ("Adjusting state when a prop changes")
  // by branching during render instead of inside a useEffect.
  const [seenPlan, setSeenPlan] = useState<AcademyPlan | null>(null);
  const aiPlan = aiState?.plan ?? null;
  if (aiPlan && aiPlan !== seenPlan) {
    setSeenPlan(aiPlan);
    setUseAiTemplate(true);
    if (!orgName.trim()) {
      setOrgName(aiPlan.academyName);
      setSlug(aiPlan.slugSuggestion || slugify(aiPlan.academyName));
    }
  }

  const steps = ["Organisation", "Design Template", "Plan", "Your Account"];

  function next() {
    setStep((s) => Math.min(4, s + 1));
  }
  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  const canContinueStep1 = orgName.trim().length > 1;
  const canContinueStep2 = !!templateKey;
  const canContinueStep3 = !!planKey;

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 40, flexWrap: "wrap" }}>
        {steps.map((label, i) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 2,
              fontSize: 13,
              fontWeight: 600,
              background: step === i + 1 ? "var(--gold)" : "rgba(255,255,255,0.06)",
              color: step === i + 1 ? "var(--navy)" : "rgba(255,255,255,0.6)",
            }}
          >
            <span>{i + 1}</span> {label}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="solution-box">
          {aiEnabled && (
            <>
          <h3>✨ Describe your academy (optional)</h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: -8, marginBottom: 16, lineHeight: 1.6 }}>
            Tell us what you&apos;re building in a sentence or two and we&apos;ll draft a name, colour theme,
            homepage copy, and a starter course outline for you to review — every part of it can still be changed
            afterward using the same tools as any other academy.
          </p>
          <form action={aiFormAction}>
            <textarea
              name="prompt"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. A workplace safety training academy for construction firms — professional and trustworthy, navy and orange."
              style={{ ...inputStyle, width: "100%", resize: "vertical", boxSizing: "border-box" }}
            />
            {aiState?.error && <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 8 }}>{aiState.error}</p>}
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="btn-outline" disabled={aiPending || !aiPrompt.trim()}>
                {aiPending ? "Generating…" : "✨ Generate with AI"}
              </button>
            </div>
          </form>

          {aiPlan && (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 4,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                {[aiPlan.template.primary_color, aiPlan.template.secondary_color, aiPlan.template.accent_color].map((c, i) => (
                  <div key={i} style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: "1px solid rgba(255,255,255,0.2)" }} />
                ))}
                <strong style={{ fontSize: 13 }}>{aiPlan.template.name}</strong>
              </div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{aiPlan.heroHeadline}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>{aiPlan.heroTagline}</div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: aiPlan.courses.length ? 12 : 0 }}>
                {aiPlan.aboutText}
              </div>
              {aiPlan.courses.length > 0 && (
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>
                  <strong>Starter courses:</strong> {aiPlan.courses.map((c) => c.title).join(", ")}
                </div>
              )}
              <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", marginTop: 10 }}>
                Filled in your organisation name and web address below from this — feel free to edit them. You&apos;ll
                choose whether to use this colour theme on the next step.
              </p>
            </div>
          )}

          <div style={{ margin: "28px 0", borderTop: "1px solid rgba(255,255,255,0.1)" }} />
            </>
          )}
          <h3>Tell us about your organisation</h3>
          <div style={{ display: "grid", gap: 20, marginTop: 24 }}>
            <label style={fieldLabel}>
              Organisation name
              <input
                className="wizard-input"
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
                }}
                placeholder="e.g. Brightwave Consulting"
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              Choose your academy web address
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>skillsacademy.ai/a/</span>
                <input
                  className="wizard-input"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}
                  placeholder="brightwave"
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </label>
            <div style={fieldLabel}>
              <span>Sector</span>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }} role="group" aria-label="Sector">
                {SECTORS.map((s) => (
                  <button
                    type="button"
                    key={s.key}
                    aria-pressed={sector === s.key}
                    onClick={() => setSector(s.key)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 2,
                      border: sector === s.key ? "1px solid var(--gold)" : "1px solid rgba(255,255,255,0.15)",
                      background: sector === s.key ? "rgba(251,203,7,0.12)" : "transparent",
                      color: sector === s.key ? "var(--gold)" : "rgba(255,255,255,0.7)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 32 }}>
            <button type="button" className="btn-primary" disabled={!canContinueStep1} onClick={next}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3 style={{ marginBottom: 20 }}>Choose a design template</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
            {aiPlan && (
              <button
                type="button"
                onClick={() => setUseAiTemplate(true)}
                style={{
                  textAlign: "left",
                  border: useAiTemplate ? "2px solid var(--gold)" : "2px solid transparent",
                  borderRadius: 4,
                  padding: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div
                  style={{
                    height: 80,
                    background: `linear-gradient(135deg, ${aiPlan.template.primary_color}, ${aiPlan.template.secondary_color})`,
                    position: "relative",
                  }}
                >
                  <div style={{ position: "absolute", bottom: 8, left: 12, width: 28, height: 8, background: aiPlan.template.accent_color, borderRadius: 2 }} />
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      background: "var(--gold)",
                      color: "var(--navy)",
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    ✨ AI
                  </span>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{aiPlan.template.name}</div>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>Generated from your description</div>
                </div>
              </button>
            )}
            {templates.map((t) => (
              <button
                type="button"
                key={t.key}
                onClick={() => {
                  setTemplateKey(t.key);
                  setUseAiTemplate(false);
                }}
                style={{
                  textAlign: "left",
                  border: templateKey === t.key && !useAiTemplate ? "2px solid var(--gold)" : "2px solid transparent",
                  borderRadius: 4,
                  padding: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ height: 80, background: `linear-gradient(135deg, ${t.primary_color}, ${t.secondary_color})`, position: "relative" }}>
                  <div style={{ position: "absolute", bottom: 8, left: 12, width: 28, height: 8, background: t.accent_color, borderRadius: 2 }} />
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{t.name}</div>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{t.description}</div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
            <button type="button" className="btn-outline" onClick={back}>
              ← Back
            </button>
            <button type="button" className="btn-primary" disabled={!canContinueStep2} onClick={next}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3 style={{ marginBottom: 20 }}>Choose your plan</h3>
          <div className="tiers-grid" style={{ marginTop: 0 }}>
            {plans.map((p, i) => {
              const features: string[] = JSON.parse(p.features_json);
              const selected = planKey === p.key;
              return (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => setPlanKey(p.key)}
                  className={`tier-card${i === 1 ? " featured" : ""}`}
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    outline: selected ? "3px solid var(--gold)" : "none",
                    outlineOffset: 2,
                  }}
                >
                  <div className="tier-num">Plan</div>
                  <div className="tier-title">{p.name}</div>
                  <div className="tier-price">
                    {formatGBP(p.price_pence)}
                    <span>/month</span>
                  </div>
                  <div className="tier-trial">{p.trial_days}-day free trial</div>
                  <ul className="tier-features">
                    {features.slice(0, 4).map((f) => (
                      <li key={f}>
                        <span className="check">✦</span> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
            <button type="button" className="btn-outline" onClick={back}>
              ← Back
            </button>
            <button type="button" className="btn-primary" disabled={!canContinueStep3} onClick={next}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <form action={formAction} className="solution-box">
          <h3>Create your admin account</h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: -12, marginBottom: 20 }}>
            You&apos;ll be the first Academy Admin for {orgName || "your academy"}.
          </p>
          <input type="hidden" name="orgName" value={orgName} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="sector" value={sector} />
          <input type="hidden" name="template" value={templateKey} />
          <input type="hidden" name="plan" value={planKey} />
          {aiPlan && <input type="hidden" name="aiPlan" value={JSON.stringify(aiPlan)} />}
          {aiPlan && <input type="hidden" name="useAiTemplate" value={useAiTemplate ? "1" : "0"} />}
          {aiPlan && (
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", marginTop: -12, marginBottom: 4 }}>
              We&apos;ll also add the homepage copy{aiPlan.courses.length ? " and starter courses" : ""} from your AI-generated
              plan{useAiTemplate ? " using its colour theme" : ""} once your academy is created.
            </p>
          )}
          <div style={{ display: "grid", gap: 20 }}>
            <label style={fieldLabel}>
              Your full name
              <input name="adminName" value={adminName} onChange={(e) => setAdminName(e.target.value)} style={inputStyle} required />
            </label>
            <label style={fieldLabel}>
              Work email
              <input name="adminEmail" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} style={inputStyle} required />
            </label>
            <label style={fieldLabel}>
              Password
              <input name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required minLength={8} />
            </label>
          </div>
          {state?.error && (
            <p style={{ color: "#ff6b6b", fontSize: 13.5, marginTop: 16 }}>{state.error}</p>
          )}
          <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
            <button type="button" className="btn-outline" onClick={back}>
              ← Back
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Creating your academy…" : "Create My Academy →"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "rgba(255,255,255,0.75)",
};

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 2,
  padding: "12px 14px",
  color: "#fff",
  fontSize: 14,
  fontWeight: 400,
};

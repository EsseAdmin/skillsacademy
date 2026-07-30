"use client";

import { useActionState, useState } from "react";
import { signupAcademy } from "@/lib/actions/signup";
import { formatGBP } from "@/lib/utils";

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
}: {
  templates: Template[];
  plans: Plan[];
  initialPlan?: string;
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
            {templates.map((t) => (
              <button
                type="button"
                key={t.key}
                onClick={() => setTemplateKey(t.key)}
                style={{
                  textAlign: "left",
                  border: templateKey === t.key ? "2px solid var(--gold)" : "2px solid transparent",
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

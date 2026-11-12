import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { formatGBP } from "@/lib/utils";
import { planTrialPhrase } from "@/lib/trial";
import {
  applyTokens,
  imageUrl,
  DEFAULT_HOME_PAGE,
  type HomePage,
  type Section,
  type Tone,
  type TokenContext,
  type LinkItem,
} from "@/lib/marketingPage";

// Renders the editable SkillsAcademy.ai home page (lib/marketingPage.ts). A server
// component with no browser code, so it is used for the live page and for the
// editor's preview alike. With the original content it produces the same markup
// (and so the same look) the page had before it became editable.

export interface PlanView {
  id: string;
  key: string;
  name: string;
  price_pence: number;
  features_json: string;
  trial_days: number;
}

const DEFAULT_TONE: Record<string, Tone> = { cards: "light", split: "dark", columns: "deep", steps: "dark", text: "light" };

function toneClass(type: string, tone: Tone | undefined): string {
  if (!tone || tone === DEFAULT_TONE[type]) return "";
  return ` tone-${tone}`;
}

function mix(hex: string, other: [number, number, number], amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (other[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Inline CSS variables for a custom colour theme (nothing at all for the original colours). */
export function themeStyle(page: HomePage): CSSProperties | undefined {
  const { navy, gold } = page.theme;
  const d = DEFAULT_HOME_PAGE.theme;
  const style: Record<string, string> = {};
  if (navy !== d.navy) {
    style["--navy"] = navy;
    style["--navy-light"] = mix(navy, [255, 255, 255], 0.05);
    style["--navy-deep"] = mix(navy, [255, 255, 255], 0.02);
    style["--footer-bg"] = mix(navy, [0, 0, 0], 0.45);
  }
  if (gold !== d.gold) {
    style["--gold"] = gold;
    style["--gold-dim"] = mix(gold, [0, 0, 0], 0.18);
  }
  return Object.keys(style).length ? (style as CSSProperties) : undefined;
}

/** "line one\nline *two*" → lines with <br/> between them and *word* in italics (gold). */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line.split(/(\*[^*]+\*)/g).map((part, j) => (/^\*[^*]+\*$/.test(part) ? <em key={j}>{part.slice(1, -1)}</em> : part))}
        </span>
      ))}
    </>
  );
}

function paragraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  const external = href.startsWith("https://");
  return (
    <a href={href} className={className} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
      {children}
    </a>
  );
}

export function MarketingNav({ page }: { page: HomePage }) {
  const n = page.nav;
  return (
    <nav>
      <Link href="/" className="nav-logo">
        {n.logoBefore}
        {n.logoAccent && <span>{n.logoAccent}</span>}
        {n.logoAfter}
      </Link>
      <ul className="nav-links">
        {n.links.map((l) => (
          <li key={l.label + l.href}>
            <SmartLink href={l.href}>{l.label}</SmartLink>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Link href="/login" className="nav-outline">
          {n.loginLabel}
        </Link>
        <Link href="/signup" className="nav-cta">
          {n.ctaLabel}
        </Link>
      </div>
    </nav>
  );
}

export function MarketingFooter({ page, ctx }: { page: HomePage; ctx: TokenContext }) {
  const n = page.nav;
  return (
    <footer>
      <div className="footer-logo">
        {n.logoBefore}
        {n.logoAccent && <span>{n.logoAccent}</span>}
        {n.logoAfter}
      </div>
      <p>{applyTokens(page.footer.text, ctx)}</p>
      <div style={{ display: "flex", gap: 20 }}>
        {page.footer.links.map((l: LinkItem) => (
          <SmartLink key={l.label + l.href} href={l.href}>
            {l.label}
          </SmartLink>
        ))}
      </div>
    </footer>
  );
}

function Heading({ tag, title, sub, t, subStyle }: { tag?: string; title?: string; sub?: string; t: (s: string) => string; subStyle?: CSSProperties }) {
  return (
    <>
      {tag && <div className="section-tag">{t(tag)}</div>}
      {title && (
        <h2 className="section-title">
          <Rich text={t(title)} />
        </h2>
      )}
      {sub && (
        <p className="section-sub" style={subStyle}>
          {t(sub)}
        </p>
      )}
    </>
  );
}

function SectionView({ s, plans, ctx }: { s: Section; plans: PlanView[]; ctx: TokenContext }) {
  const t = (x: string) => applyTokens(x, ctx);
  const id = s.anchor || undefined;
  switch (s.type) {
    case "hero": {
      const primary = s.primaryLabel ? t(s.primaryLabel) : ctx.hasTrial ? `Start Your ${ctx.trialAdjective.replace("day", "Day")} Free Trial` : "Create Your Academy";
      return (
        <section className={`hero${s.image ? " has-image" : ""}`} id={id}>
          <div className="hero-bg" />
          <div className="hero-grid" />
          <div className="hero-content">
            {s.tag && <div className="hero-tag">{t(s.tag)}</div>}
            <h1>
              <Rich text={t(s.headline)} />
            </h1>
            {s.sub && <p className="hero-sub">{t(s.sub)}</p>}
            <div className="hero-actions">
              <SmartLink href={s.primaryHref || "/signup"} className="btn-primary">
                {primary}
              </SmartLink>
              {s.secondaryLabel && s.secondaryHref && (
                <SmartLink href={s.secondaryHref} className="btn-outline">
                  {t(s.secondaryLabel)}
                </SmartLink>
              )}
            </div>
          </div>
          {s.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hero-image" src={imageUrl(s.image)} alt={s.imageAlt} data-testid="hero-image" />
          )}
          {s.showStats && s.stats.length > 0 && (
            <div className="hero-right">
              {s.stats.map((st, i) => (
                <div className="hero-stat" key={i}>
                  <div className="num">{t(st.value)}</div>
                  <div className="label">{t(st.label)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }
    case "cards":
      return (
        <section className={`problem${toneClass("cards", s.tone)}`} id={id}>
          <Heading tag={s.tag} title={s.title} sub={s.sub} t={t} />
          <div className="problem-grid" data-cols={s.columns}>
            {s.items.map((it, i) => (
              <div className="problem-card" key={i}>
                {it.icon && <div className="icon">{it.icon}</div>}
                <h3>{t(it.title)}</h3>
                <p>{t(it.text)}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "split": {
      const visual = s.image || (s.listStyle !== "none" && s.list.length > 0);
      return (
        <section className={`solution${toneClass("split", s.tone)}`} id={id}>
          <div className={`solution-inner${visual ? "" : " single"}${s.imageSide === "left" ? " flip" : ""}`}>
            <div>
              <Heading tag={s.tag} title={s.title} sub={s.sub} t={t} subStyle={s.body ? { marginBottom: 32 } : undefined} />
              {paragraphs(t(s.body)).map((p, i) => (
                <p className="section-sub" key={i} style={i > 0 ? { marginTop: 16 } : undefined}>
                  {p}
                </p>
              ))}
            </div>
            {visual && (
              <div className="solution-visual">
                {s.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="split-image" src={imageUrl(s.image)} alt={s.imageAlt} data-testid="split-image" />
                )}
                {s.listStyle !== "none" && s.list.length > 0 && (
                  <div className="solution-box" style={s.image ? { marginTop: 24 } : undefined}>
                    {s.listTitle && <h3>{t(s.listTitle)}</h3>}
                    {s.list.map((li, i) => (
                      <div className="pillar-row" key={i}>
                        <div className={`pillar-num${s.listStyle === "bullets" ? " dot" : ""}`}>{s.listStyle === "numbered" ? i + 1 : ""}</div>
                        <div className="pillar-text">
                          <strong>{t(li.title)}</strong>
                          {li.text ? ` — ${t(li.text)}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      );
    }
    case "columns":
      return (
        <section className={`segments${toneClass("columns", s.tone)}`} id={id}>
          <Heading tag={s.tag} title={s.title} sub={s.sub} t={t} />
          <div className="segments-grid" data-cols={s.items.length}>
            {s.items.map((it, i) => (
              <div className="segment-card" key={i}>
                {it.icon && <div className="seg-icon">{it.icon}</div>}
                <div className="seg-title">{t(it.title)}</div>
                <ul className="seg-list">
                  {it.bullets.map((b, j) => (
                    <li key={j}>{t(b)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      );
    case "steps":
      return (
        <section className={`how${toneClass("steps", s.tone)}`} id={id}>
          <Heading tag={s.tag} title={s.title} t={t} />
          <div className="steps">
            {s.items.map((it, i) => (
              <div className="step" key={i}>
                <div className="step-circle">{i + 1}</div>
                <h4>{t(it.title)}</h4>
                <p>{t(it.text)}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "pricing":
      return (
        <section className="tiers" id={id}>
          <Heading tag={s.tag} title={s.title} sub={s.sub} t={t} />
          <div className="tiers-grid">
            {plans.map((plan, i) => {
              let features: string[] = [];
              try {
                features = JSON.parse(plan.features_json);
              } catch {
                /* a plan with unreadable features still shows its price */
              }
              const featured = i === 1;
              return (
                <div key={plan.id} className={`tier-card${featured ? " featured" : ""}`}>
                  {featured && s.badge && <div className="tier-badge">{s.badge}</div>}
                  <div className="tier-num">Plan</div>
                  <div className="tier-title">{plan.name}</div>
                  <div className="tier-price">
                    {formatGBP(plan.price_pence)}
                    <span>/month</span>
                  </div>
                  <div className="tier-trial">{planTrialPhrase(plan.trial_days)}</div>
                  <ul className="tier-features">
                    {features.map((f) => (
                      <li key={f}>
                        <span className="check">✦</span> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/signup?plan=${plan.key}`} className="tier-cta">
                    {s.ctaLabel}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      );
    case "banner":
      return (
        <section className={`mk-banner ${s.height}`} id={id}>
          {s.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(s.image)} alt={s.imageAlt} data-testid="banner-image" />
          )}
          <div className="mk-banner-shade" />
          <div className="mk-banner-content">
            {s.title && (
              <h2 className="section-title">
                <Rich text={t(s.title)} />
              </h2>
            )}
            {s.text && <p>{t(s.text)}</p>}
            {s.buttonLabel && s.buttonHref && (
              <SmartLink href={s.buttonHref} className="btn-primary">
                {t(s.buttonLabel)}
              </SmartLink>
            )}
          </div>
        </section>
      );
    case "text":
      return (
        <section className={`mk-text${s.align === "center" ? " center" : ""}${toneClass("text", s.tone)}`} id={id}>
          <Heading tag={s.tag} title={s.title} t={t} />
          {paragraphs(t(s.body)).map((p, i) => (
            <p className="mk-body" key={i}>
              {p}
            </p>
          ))}
        </section>
      );
    case "cta":
      return (
        <section className="cta-section" id={id}>
          {s.tag && (
            <div className="section-tag" style={{ color: "var(--navy)", opacity: 0.6 }}>
              {t(s.tag)}
            </div>
          )}
          <h2 className="section-title">
            <Rich text={t(s.title)} />
          </h2>
          {s.text && <p>{t(s.text)}</p>}
          {s.buttonLabel && (
            <SmartLink href={s.buttonHref || "/signup"} className="btn-dark">
              {t(s.buttonLabel)}
            </SmartLink>
          )}
        </section>
      );
  }
}

export function MarketingSections({ page, plans, ctx }: { page: HomePage; plans: PlanView[]; ctx: TokenContext }) {
  return (
    <>
      {page.sections
        .filter((s) => s.visible)
        .map((s) => (
          <SectionView key={s.id} s={s} plans={plans} ctx={ctx} />
        ))}
    </>
  );
}

import Link from "next/link";
import { Plans, Academies } from "@/lib/queries";
import { formatGBP } from "@/lib/utils";

export default async function HomePage() {
  const plans = await Plans.all(true);
  const academyCount = (await Academies.all()).length;

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="hero-tag">Academy-as-a-Service</div>
          <h1>
            Launch Your Own
            <br />
            <em>Branded</em>
            <br />
            Training Academy
          </h1>
          <p className="hero-sub">
            SkillsAcademy.ai gives businesses, charities and public sector organisations a ready-made,
            Moodle-style learning platform — your own courses, your own modules, your own learners — live
            in minutes, not months.
          </p>
          <div className="hero-actions">
            <Link href="/signup" className="btn-primary">
              Start Your 14-Day Free Trial
            </Link>
            <a href="#solution" className="btn-outline">
              See How It Works
            </a>
          </div>
        </div>
        <div className="hero-right">
          <div className="hero-stat">
            <div className="num">{plans.length}</div>
            <div className="label">Subscription Plans</div>
          </div>
          <div className="hero-stat">
            <div className="num">14</div>
            <div className="label">Day Free Trial</div>
          </div>
          <div className="hero-stat">
            <div className="num">{academyCount}+</div>
            <div className="label">Academies Live</div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="problem" id="problem">
        <div className="section-tag">The Challenge</div>
        <h2 className="section-title">Every organisation faces the same skills &amp; training gap</h2>
        <p className="section-sub">
          Whether you&apos;re a business, charity, or public sector body — fragmented, inconsistent
          training is costing you time, money, and credibility.
        </p>
        <div className="problem-grid">
          <div className="problem-card">
            <div className="icon">⚠️</div>
            <h3>Compliance Risk</h3>
            <p>Manual tracking and no audit trail leaves organisations exposed to regulatory and reputational risk.</p>
          </div>
          <div className="problem-card">
            <div className="icon">💸</div>
            <h3>High Costs</h3>
            <p>In-person training is expensive to deliver, hard to scale, and impossible to standardise.</p>
          </div>
          <div className="problem-card">
            <div className="icon">📉</div>
            <h3>Lost Revenue</h3>
            <p>Organisations sitting on valuable expertise have no infrastructure to monetise it through courses.</p>
          </div>
          <div className="problem-card">
            <div className="icon">🔀</div>
            <h3>Inconsistent Onboarding</h3>
            <p>Every new hire, volunteer, or contractor gets a different experience.</p>
          </div>
          <div className="problem-card">
            <div className="icon">🔍</div>
            <h3>No Audit Trail</h3>
            <p>When funders, regulators, or auditors ask for evidence of training, you shouldn&apos;t be scrambling.</p>
          </div>
          <div className="problem-card">
            <div className="icon">🧩</div>
            <h3>No Scalable Infrastructure</h3>
            <p>Growth demands infrastructure. Without a central platform, training breaks down at scale.</p>
          </div>
        </div>
      </section>

      {/* SOLUTION */}
      <section className="solution" id="solution">
        <div className="solution-inner">
          <div>
            <div className="section-tag">The Platform</div>
            <h2 className="section-title">
              A full academy platform,
              <br />
              <em style={{ color: "var(--gold)", fontStyle: "italic" }}>built for you.</em>
            </h2>
            <p className="section-sub" style={{ marginBottom: 32 }}>
              We don&apos;t sell courses — we give you the infrastructure to build your own: courses,
              modules, learners, instructors and admins, all under your own brand.
            </p>
            <p className="section-sub">Choose a design template, invite your team, and start teaching.</p>
          </div>
          <div className="solution-visual">
            <div className="solution-box">
              <h3>What every academy gets</h3>
              <div className="pillar-row">
                <div className="pillar-num">1</div>
                <div className="pillar-text">
                  <strong>Your Own Branded Academy</strong> — choose from multiple design templates
                </div>
              </div>
              <div className="pillar-row">
                <div className="pillar-num">2</div>
                <div className="pillar-text">
                  <strong>Courses &amp; Modules</strong> — text, URL, Word, PDF or PowerPoint content
                </div>
              </div>
              <div className="pillar-row">
                <div className="pillar-num">3</div>
                <div className="pillar-text">
                  <strong>Three Role-Based Views</strong> — learner, instructor, and academy admin
                </div>
              </div>
              <div className="pillar-row">
                <div className="pillar-num">4</div>
                <div className="pillar-text">
                  <strong>Paid or Free Enrolment</strong> — sell courses and modules to your learners
                </div>
              </div>
              <div className="pillar-row">
                <div className="pillar-num">5</div>
                <div className="pillar-text">
                  <strong>Secure Logins</strong> — dedicated login &amp; logout for every role
                </div>
              </div>
              <div className="pillar-row">
                <div className="pillar-num">6</div>
                <div className="pillar-text">
                  <strong>Simple Subscription</strong> — 14-day free trial, cancel anytime
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEGMENTS */}
      <section className="segments" id="segments">
        <div className="section-tag">Who We Serve</div>
        <h2 className="section-title">Three sectors. One proven platform.</h2>
        <p className="section-sub">
          SkillsAcademy.ai is tailored to the governance, compliance, and growth needs of each sector.
        </p>
        <div className="segments-grid">
          <div className="segment-card">
            <div className="seg-icon">🏢</div>
            <div className="seg-title">Businesses</div>
            <ul className="seg-list">
              <li>Monetise your expertise through client academies</li>
              <li>Build certification pathways that increase retention</li>
              <li>Standardise client &amp; staff onboarding at scale</li>
              <li>Create a new, recurring revenue stream</li>
              <li>Build thought leadership in your sector</li>
            </ul>
          </div>
          <div className="segment-card">
            <div className="seg-icon">🤝</div>
            <div className="seg-title">Charities &amp; Community Orgs</div>
            <ul className="seg-list">
              <li>Train volunteers consistently and safely</li>
              <li>Reduce safeguarding and governance risk</li>
              <li>Improve credibility with funders</li>
              <li>Onboard new staff and volunteers quickly</li>
              <li>Demonstrate compliance to regulators</li>
            </ul>
          </div>
          <div className="segment-card">
            <div className="seg-icon">🏛️</div>
            <div className="seg-title">Local Government &amp; Public Sector</div>
            <ul className="seg-list">
              <li>Standardise compliance across departments</li>
              <li>Manage contractor training and accountability</li>
              <li>Full audit trail for inspections and reporting</li>
              <li>CPD tracking and certification renewal</li>
              <li>Reduce cost vs in-person training delivery</li>
            </ul>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="tiers" id="pricing">
        <div className="section-tag">Pricing</div>
        <h2 className="section-title">One plan for your whole academy</h2>
        <p className="section-sub">
          Every plan includes a 14-day free trial. No credit card charge until your trial ends, and you can
          change or cancel any time from your academy admin dashboard.
        </p>
        <div className="tiers-grid">
          {plans.map((plan, i) => {
            const features: string[] = JSON.parse(plan.features_json);
            const featured = i === 1;
            return (
              <div key={plan.id} className={`tier-card${featured ? " featured" : ""}`}>
                {featured && <div className="tier-badge">Most Popular</div>}
                <div className="tier-num">Plan</div>
                <div className="tier-title">{plan.name}</div>
                <div className="tier-price">
                  {formatGBP(plan.price_pence)}
                  <span>/month</span>
                </div>
                <div className="tier-trial">{plan.trial_days}-day free trial</div>
                <ul className="tier-features">
                  {features.map((f) => (
                    <li key={f}>
                      <span className="check">✦</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href={`/signup?plan=${plan.key}`} className="tier-cta">
                  Start Free Trial →
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how" id="how">
        <div className="section-tag">The Process</div>
        <h2 className="section-title">From sign up to launch in minutes</h2>
        <div className="steps">
          <div className="step">
            <div className="step-circle">1</div>
            <h4>Create Your Academy</h4>
            <p>Tell us about your organisation and choose your sector.</p>
          </div>
          <div className="step">
            <div className="step-circle">2</div>
            <h4>Pick a Template</h4>
            <p>Choose a design template that matches your brand.</p>
          </div>
          <div className="step">
            <div className="step-circle">3</div>
            <h4>Choose a Plan</h4>
            <p>Select Starter, Growth or Enterprise — 14 days free.</p>
          </div>
          <div className="step">
            <div className="step-circle">4</div>
            <h4>Add Courses &amp; People</h4>
            <p>Instructors build courses and modules; admins add learners.</p>
          </div>
          <div className="step">
            <div className="step-circle">5</div>
            <h4>Go Live</h4>
            <p>Learners log in, enrol, pay where required, and start learning.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section" id="contact">
        <div className="section-tag" style={{ color: "var(--navy)", opacity: 0.6 }}>
          Get Started
        </div>
        <h2 className="section-title">Ready to build your academy?</h2>
        <p>Start your 14-day free trial today. No commitment, cancel any time.</p>
        <Link href="/signup" className="btn-dark">
          Create Your Academy →
        </Link>
      </section>
    </>
  );
}

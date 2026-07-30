import { Templates, Plans } from "@/lib/queries";
import SignupWizard from "@/components/SignupWizard";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const templates = await Templates.all();
  const plans = await Plans.all(true);

  return (
    <section style={{ paddingTop: 140, minHeight: "100vh" }}>
      <div className="section-tag">Create Your Academy</div>
      <h1 className="section-title">Let&apos;s set up your academy</h1>
      <p className="section-sub" style={{ marginBottom: 40 }}>
        Four quick steps — you won&apos;t be charged until your 14-day free trial ends.
      </p>
      <SignupWizard templates={templates} plans={plans} initialPlan={plan} />
    </section>
  );
}

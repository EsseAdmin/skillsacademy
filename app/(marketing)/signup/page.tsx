import { Templates, Plans } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai";
import SignupWizard from "@/components/SignupWizard";
import { summariseTrials } from "@/lib/trial";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const templates = await Templates.all();
  const plans = await Plans.all(true);
  const trial = summariseTrials(plans);

  return (
    <section style={{ paddingTop: 140, minHeight: "100vh" }}>
      <div className="section-tag">Create Your Academy</div>
      <h1 className="section-title">Let&apos;s set up your academy</h1>
      <p className="section-sub" style={{ marginBottom: 40 }}>
        {trial.hasTrial
          ? `Four quick steps — you won't be charged until your ${trial.phrase} ends.`
          : "Four quick steps to set up your academy."}
      </p>
      <SignupWizard templates={templates} plans={plans} initialPlan={plan} aiEnabled={isAiConfigured()} />
    </section>
  );
}

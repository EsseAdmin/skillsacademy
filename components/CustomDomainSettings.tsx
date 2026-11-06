"use client";

import { useActionState } from "react";
import { setCustomDomain, verifyCustomDomain, removeCustomDomain, type DomainActionState } from "@/lib/actions/customDomain";
import type { Academy } from "@/lib/queries";

function ErrorNote({ state }: { state: DomainActionState }) {
  if (!state?.error) return null;
  return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{state.error}</p>;
}

export default function CustomDomainSettings({
  academy,
  slug,
  cnameTarget,
}: {
  academy: Academy;
  slug: string;
  cnameTarget: string;
}) {
  const [setState, setAction, setPending] = useActionState<DomainActionState, FormData>(
    setCustomDomain.bind(null, slug),
    null
  );
  const [verifyState, verifyAction, verifyPending] = useActionState<DomainActionState, FormData>(
    verifyCustomDomain.bind(null, slug),
    null
  );
  const [removeState, removeAction, removePending] = useActionState<DomainActionState, FormData>(
    removeCustomDomain.bind(null, slug),
    null
  );

  const verifyRecordName = academy.custom_domain ? `_skillsacademy-verify.${academy.custom_domain}` : "";

  return (
    <div className="app-card p-6 max-w-lg mt-6">
      <h2 className="font-semibold text-gray-900 mb-1">Custom domain</h2>
      <p className="text-gray-500 text-sm mb-4">
        Publish your academy at your own domain (e.g. <code>academy.yourcompany.com</code>) instead of{" "}
        <code>skillsacademy.ai/a/{academy.slug}</code>.
      </p>

      {!academy.custom_domain && (
        <form action={setAction} className="grid gap-3">
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Your domain
            <input
              name="custom_domain"
              required
              placeholder="academy.yourcompany.com"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <ErrorNote state={setState} />
          <div>
            <button
              type="submit"
              disabled={setPending}
              className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {setPending ? "Connecting…" : "Connect domain"}
            </button>
          </div>
        </form>
      )}

      {academy.custom_domain && !academy.custom_domain_verified_at && (
        <div className="grid gap-4">
          <div className="text-xs font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 rounded-full px-3 py-1 inline-block w-fit">
            ○ Pending verification
          </div>
          <p className="text-sm text-gray-600">
            Add these two DNS records at your domain registrar for <strong>{academy.custom_domain}</strong>, then
            come back and verify. DNS changes can take anywhere from a few minutes to a few hours to spread.
          </p>
          <div className="rounded-md border border-gray-200 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Host</th>
                  <th className="px-3 py-2 font-semibold">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-3 py-2 font-mono">CNAME</td>
                  <td className="px-3 py-2 font-mono break-all">{academy.custom_domain}</td>
                  <td className="px-3 py-2 font-mono break-all">{cnameTarget}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono">TXT</td>
                  <td className="px-3 py-2 font-mono break-all">{verifyRecordName}</td>
                  <td className="px-3 py-2 font-mono break-all">{academy.custom_domain_verification_token}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            The TXT record proves you control this domain. The CNAME record is what actually sends visitors to your
            academy once everything&apos;s connected.
          </p>
          <ErrorNote state={verifyState} />
          <ErrorNote state={removeState} />
          <div className="flex flex-wrap gap-3">
            <form action={verifyAction}>
              <button
                type="submit"
                disabled={verifyPending}
                className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {verifyPending ? "Checking…" : "I've added the records — Verify"}
              </button>
            </form>
            <form action={removeAction}>
              <button
                type="submit"
                disabled={removePending}
                className="text-sm font-semibold text-gray-500 hover:text-red-600 px-3 py-2.5 disabled:opacity-60"
              >
                Remove domain
              </button>
            </form>
          </div>
        </div>
      )}

      {academy.custom_domain && academy.custom_domain_verified_at && (
        <div className="grid gap-4">
          <div className="text-xs font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 rounded-full px-3 py-1 inline-block w-fit">
            ● Verified
          </div>
          <p className="text-sm text-gray-600">
            <strong>{academy.custom_domain}</strong> is verified and pointed at SkillsAcademy.ai. Your academy is
            still also reachable at <code>skillsacademy.ai/a/{academy.slug}</code>.
          </p>
          <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
            One more step happens on our side: our platform team finishes connecting {academy.custom_domain} in our
            hosting so it actually starts serving your academy (and gets its own SSL certificate) — this usually
            happens shortly after verification. If it&apos;s been more than a day, reach out to support.
          </p>
          <ErrorNote state={removeState} />
          <form action={removeAction}>
            <button
              type="submit"
              disabled={removePending}
              className="text-sm font-semibold text-gray-500 hover:text-red-600 disabled:opacity-60"
            >
              Disconnect domain
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

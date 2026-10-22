"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { safeAction } from "@/lib/safeAction";

type State = { error?: string; success?: true } | undefined;

export default function SiteContentForm({
  slug,
  action,
  academyName,
  values,
  hasLogo,
  logoVersion,
}: {
  slug: string;
  action: (prev: State, formData: FormData) => Promise<State>;
  academyName: string;
  values: { hero_headline: string; hero_tagline: string; about_text: string; learn_items: string };
  hasLogo: boolean;
  logoVersion: string;
}) {
  const wrapped = safeAction(action, "Couldn't save — the connection dropped or the logo was too large. Please try again.");
  // Controlled so a rejected upload doesn't wipe what was typed (React resets uncontrolled fields after every submit).
  const [v, setV] = useState(values);
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const [state, formAction, pending] = useActionState(wrapped, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-1.5">
        <span className="text-xs font-semibold text-gray-600">Business logo</span>
        <div className="flex items-center gap-4 flex-wrap">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/academy-logo/${slug}?v=${encodeURIComponent(logoVersion)}`}
              alt="Current logo"
              className="h-12 max-w-[10rem] object-contain rounded border border-gray-200 bg-white p-1"
            />
          ) : (
            <span className="text-xs text-gray-400">No logo yet — your academy name is shown instead.</span>
          )}
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            className="text-xs text-gray-600"
            data-testid="logo-input"
          />
        </div>
        {hasLogo && (
          <label className="text-xs text-gray-500 flex items-center gap-2">
            <input type="checkbox" name="remove_logo" /> Remove the current logo
          </label>
        )}
        <span className="text-[11px] text-gray-400">PNG, JPG, GIF, WebP or SVG, up to 2MB. A wide logo on a transparent background works best.</span>
      </div>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Headline
        <input
          name="hero_headline"
          value={v.hero_headline} onChange={set("hero_headline")}
          placeholder={academyName}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Tagline <span className="font-normal text-gray-400">(optional — shown under the headline)</span>
        <input name="hero_tagline" value={v.hero_tagline} onChange={set("hero_tagline")} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        About text <span className="font-normal text-gray-400">(optional — adds an About section)</span>
        <textarea name="about_text" rows={3} value={v.about_text} onChange={set("about_text")} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        What you&apos;ll learn <span className="font-normal text-gray-400">(one point per line, up to 8)</span>
        <textarea
          name="learn_items"
          rows={6}
          value={v.learn_items} onChange={set("learn_items")}
          placeholder={"Leave blank to draw these from your courses automatically, or write your own, e.g.\nBuild clear, reusable skills you can apply at work\nWork with real examples and exercises"}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">Saved — the preview below is up to date.</p>}
      <div className="flex items-center justify-between">
        <button type="submit" disabled={pending} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
          {pending ? "Saving…" : "Save Changes"}
        </button>
        <Link href={`/a/${slug}/admin/branding`} className="text-xs app-link font-semibold">
          Change template &amp; colours →
        </Link>
      </div>
    </form>
  );
}

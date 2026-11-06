"use client";

import { useState } from "react";

export default function UtmLinkGenerator({ baseUrl }: { baseUrl: string }) {
  const [source, setSource] = useState("newsletter");
  const [medium, setMedium] = useState("email");
  const [campaign, setCampaign] = useState("");

  const params = new URLSearchParams();
  if (source) params.set("utm_source", source);
  if (medium) params.set("utm_medium", medium);
  if (campaign) params.set("utm_campaign", campaign);
  const generated = `${baseUrl}${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-3">
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Source
          <input value={source} onChange={(e) => setSource(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="newsletter" />
        </label>
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Medium
          <input value={medium} onChange={(e) => setMedium(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="email" />
        </label>
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Campaign
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="spring-launch" />
        </label>
      </div>
      <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-mono break-all text-gray-700">{generated}</div>
    </div>
  );
}

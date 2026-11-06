"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CATALOG, type CatalogItem } from "@/lib/activities";

type Tab = "all" | "activity" | "resource" | "starred";
const FAV_KEY = "sa-activity-favourites";

function loadFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveFavs(f: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(f));
  } catch {
    /* favourites are a convenience only */
  }
}

// The "Add an activity or resource" dialog. Each tile opens the right create
// screen: a settings form for most types, the existing builders for Quiz and
// SCORM. Favourites are remembered in this browser only.
export default function ActivityPicker({ slug, area, courseId }: { slug: string; area: "admin" | "instructor"; courseId?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [favs, setFavs] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const hrefFor = (c: CatalogItem) => {
    const cq = courseId ? `courseId=${encodeURIComponent(courseId)}` : "";
    if (c.href === "quiz") return `/a/${slug}/${area}/quizzes/new${cq ? `?${cq}` : ""}`;
    if (c.href === "scorm") return `/a/${slug}/${area}/scorm/new${cq ? `?${cq}` : ""}`;
    return `/a/${slug}/${area}/modules/new?type=${c.type}${cq ? `&${cq}` : ""}`;
  };

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CATALOG.filter((c) => {
      if (tab === "activity" && c.group !== "activity") return false;
      if (tab === "resource" && c.group !== "resource") return false;
      if (tab === "starred" && !favs.includes(c.type)) return false;
      if (needle && !(c.label.toLowerCase().includes(needle) || c.blurb.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [q, tab, favs]);

  const toggleFav = (type: string) => {
    const next = favs.includes(type) ? favs.filter((f) => f !== type) : [...favs, type];
    setFavs(next);
    saveFavs(next);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "starred", label: "Starred" },
    { key: "all", label: "All" },
    { key: "activity", label: "Activities" },
    { key: "resource", label: "Resources" },
  ];

  return (
    <>
      <button type="button" onClick={() => { setFavs(loadFavs()); setOpen(true); }} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
        + Add an activity or resource
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Add an activity or resource" className="w-full max-w-4xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between px-6 pt-5">
              <h2 className="text-xl font-semibold text-gray-900">Add an activity or resource</h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-2xl leading-none text-gray-500 hover:text-gray-900">
                ×
              </button>
            </div>
            <div className="px-6 pt-4">
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                aria-label="Search activities and resources"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900"
              />
            </div>
            <div className="mt-4 flex gap-1 border-b border-gray-200 px-6" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-900"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 bg-gray-50 p-5 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((c) => (
                <div key={c.type} className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 text-center">
                  <Link href={hrefFor(c)} className="flex flex-1 flex-col items-center gap-2 rounded-md py-2 hover:bg-gray-50" data-activity-type={c.type}>
                    <span className="text-3xl" aria-hidden>
                      {c.icon}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{c.label}</span>
                  </Link>
                  <div className="mt-1 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleFav(c.type)}
                      aria-label={favs.includes(c.type) ? `Remove ${c.label} from starred` : `Star ${c.label}`}
                      aria-pressed={favs.includes(c.type)}
                      className={`text-lg leading-none ${favs.includes(c.type) ? "text-amber-500" : "text-gray-400 hover:text-gray-700"}`}
                    >
                      {favs.includes(c.type) ? "★" : "☆"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInfo(info === c.type ? null : c.type)}
                      aria-label={`About ${c.label}`}
                      aria-expanded={info === c.type}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-500 text-xs font-bold text-white hover:bg-gray-700"
                    >
                      i
                    </button>
                  </div>
                  {info === c.type && <p className="mt-2 text-xs leading-snug text-gray-700">{c.blurb}</p>}
                </div>
              ))}
              {items.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-gray-600">{tab === "starred" && !q ? "Star the items you use most and they'll show up here." : "Nothing matches that search."}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

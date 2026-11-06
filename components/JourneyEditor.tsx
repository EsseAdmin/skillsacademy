"use client";

import { useState, useTransition } from "react";
import JourneyMap from "@/components/JourneyMap";
import { JOURNEY_LIMITS, JOURNEY_PALETTE, type JourneyDoc, type JourneyStation, type StationKind } from "@/lib/journeyTypes";
import type { SaveJourneyState } from "@/lib/actions/journeys";

interface Option {
  id: string;
  title: string;
}

const MAP_LABELS = {
  pathways: "Pathways",
  onPathways: "On these pathways",
  viewCourse: "View course",
  openLink: "Open link",
  mapLabel: "Learning journey map",
  selectHint: "Select a station on the map to preview its details.",
  close: "Close",
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "x" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const field = "rounded-md border border-gray-300 px-3 py-2 text-sm bg-white";
const label = "text-xs font-semibold text-gray-600 grid gap-1.5";

/**
 * The journey builder: pathways (lines) and stations on the left, and a live
 * metro map on top that redraws as you edit. Everything is saved in one go.
 */
export default function JourneyEditor({
  initial,
  courses,
  modules,
  onSave,
  homeHref = "/",
}: {
  initial: JourneyDoc;
  courses: Option[];
  modules: Option[];
  onSave: (payload: string) => Promise<SaveJourneyState>;
  homeHref?: string;
}) {
  const [doc, setDoc] = useState<JourneyDoc>(initial);
  const [status, setStatus] = useState<SaveJourneyState>(undefined);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (fn: (d: JourneyDoc) => JourneyDoc) => {
    setDoc((d) => fn(d));
    setDirty(true);
    setStatus(undefined);
  };

  const addLine = () =>
    update((d) => {
      if (d.lines.length >= JOURNEY_LIMITS.lines) return d;
      const id = uid();
      const used = new Set(d.lines.map((l) => l.color));
      const color = JOURNEY_PALETTE.find((c) => !used.has(c)) ?? JOURNEY_PALETTE[d.lines.length % JOURNEY_PALETTE.length];
      return { ...d, lines: [...d.lines, { id, name: "", color }], stops: { ...d.stops, [id]: [] } };
    });
  const removeLine = (id: string) =>
    update((d) => {
      const stops = { ...d.stops };
      delete stops[id];
      return { ...d, lines: d.lines.filter((l) => l.id !== id), stops };
    });
  const addStation = () =>
    update((d) => {
      if (d.stations.length >= JOURNEY_LIMITS.stations) return d;
      const s: JourneyStation = { id: uid(), kind: "COURSE", courseId: null, moduleId: null, title: "", description: "", url: null };
      return { ...d, stations: [...d.stations, s] };
    });
  const patchStation = (id: string, patch: Partial<JourneyStation>) =>
    update((d) => ({ ...d, stations: d.stations.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const removeStation = (id: string) =>
    update((d) => ({
      ...d,
      stations: d.stations.filter((s) => s.id !== id),
      stops: Object.fromEntries(Object.entries(d.stops).map(([k, v]) => [k, v.filter((x) => x !== id)])),
    }));
  const changeKind = (s: JourneyStation, kind: StationKind) => patchStation(s.id, { kind, courseId: null, moduleId: null, url: null });
  const pickRef = (s: JourneyStation, refId: string) => {
    const list = s.kind === "COURSE" ? courses : modules;
    const found = list.find((o) => o.id === refId);
    patchStation(s.id, {
      ...(s.kind === "COURSE" ? { courseId: refId || null } : { moduleId: refId || null }),
      // Fill in the title from the course or module unless the author already typed one.
      title: s.title.trim() ? s.title : (found?.title ?? "").slice(0, JOURNEY_LIMITS.stationTitle),
    });
  };
  const addStop = (lineId: string, stationId: string) => {
    if (!stationId) return;
    update((d) => ({ ...d, stops: { ...d.stops, [lineId]: [...(d.stops[lineId] ?? []), stationId].slice(0, JOURNEY_LIMITS.stopsPerLine) } }));
  };
  const moveStop = (lineId: string, index: number, dir: -1 | 1) =>
    update((d) => {
      const list = [...(d.stops[lineId] ?? [])];
      const j = index + dir;
      if (j < 0 || j >= list.length) return d;
      [list[index], list[j]] = [list[j], list[index]];
      return { ...d, stops: { ...d.stops, [lineId]: list } };
    });
  const removeStop = (lineId: string, index: number) =>
    update((d) => ({ ...d, stops: { ...d.stops, [lineId]: (d.stops[lineId] ?? []).filter((_, i) => i !== index) } }));

  const save = () => {
    startTransition(async () => {
      const res = await onSave(JSON.stringify(doc));
      setStatus(res);
      if (res?.success) setDirty(false);
    });
  };

  const onMap = new Set(Object.values(doc.stops).flat());
  const unplaced = doc.stations.filter((s) => !onMap.has(s.id));
  const stationTitle = (id: string) => doc.stations.find((s) => s.id === id)?.title || "Untitled station";
  const previewStations = doc.stations.map((s) => ({ ...s, title: s.title || "Untitled station", href: null, hrefKind: null }));

  return (
    <div className="grid gap-8" data-testid="journey-editor">
      <section className="app-card p-6 grid gap-4">
        <label className={label}>
          Journey title
          <input className={field} value={doc.title} maxLength={JOURNEY_LIMITS.title} onChange={(e) => update((d) => ({ ...d, title: e.target.value }))} data-testid="journey-title" />
        </label>
        <label className={label}>
          Short introduction (optional)
          <textarea className={field} rows={2} value={doc.description} maxLength={JOURNEY_LIMITS.description} onChange={(e) => update((d) => ({ ...d, description: e.target.value }))} />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={doc.published} onChange={(e) => update((d) => ({ ...d, published: e.target.checked }))} data-testid="journey-published" />
          <span><strong>Add this journey to your academy&apos;s home page</strong> — learners will see it as a map under your courses.</span>
        </label>
      </section>

      <section>
        <h2 className="font-semibold text-gray-900 mb-1">Preview</h2>
        <p className="text-sm text-gray-500 mb-3">This is how learners will see the map. It redraws as you build.</p>
        {onMap.size > 0 ? (
          <JourneyMap title={doc.title} lines={doc.lines} stations={previewStations} stops={doc.stops} labels={MAP_LABELS} />
        ) : (
          <div className="app-card p-8 text-center text-sm text-gray-500">Add pathways and stations below, then place stations on a pathway to see the map.</div>
        )}
      </section>

      <section className="app-card p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">1. Stations</h2>
          <button type="button" onClick={addStation} disabled={doc.stations.length >= JOURNEY_LIMITS.stations} className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold" data-testid="add-station">
            + Add station
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">A station is a course, a module or any other activity (a workshop, a placement, a link). Stations can be shared by several pathways.</p>
        <div className="grid gap-4">
          {doc.stations.map((s, i) => {
            const options = s.kind === "COURSE" ? courses : modules;
            const refValue = s.kind === "COURSE" ? s.courseId ?? "" : s.moduleId ?? "";
            return (
              <div key={s.id} className="border border-gray-200 rounded-lg p-4 grid gap-3" data-testid="station-row">
                <div className="grid md:grid-cols-[10rem_1fr_auto] gap-3 items-end">
                  <label className={label}>
                    Type
                    <select className={field} value={s.kind} onChange={(e) => changeKind(s, e.target.value as StationKind)} data-testid={`station-kind-${i}`}>
                      <option value="COURSE">Course</option>
                      <option value="MODULE">Module</option>
                      <option value="ACTIVITY">Other activity</option>
                    </select>
                  </label>
                  {s.kind === "ACTIVITY" ? (
                    <label className={label}>
                      Link (optional)
                      <input className={field} value={s.url ?? ""} placeholder="https://…" maxLength={JOURNEY_LIMITS.url} onChange={(e) => patchStation(s.id, { url: e.target.value })} />
                    </label>
                  ) : (
                    <label className={label}>
                      {s.kind === "COURSE" ? "Course" : "Module"}
                      <select className={field} value={refValue} onChange={(e) => pickRef(s, e.target.value)} data-testid={`station-ref-${i}`}>
                        <option value="">Choose…</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button type="button" onClick={() => removeStation(s.id)} className="text-xs font-semibold text-red-600 hover:underline pb-2.5">
                    Remove
                  </button>
                </div>
                <label className={label}>
                  Station name (shown on the map)
                  <input className={field} value={s.title} maxLength={JOURNEY_LIMITS.stationTitle} onChange={(e) => patchStation(s.id, { title: e.target.value })} data-testid={`station-title-${i}`} />
                </label>
                <label className={label}>
                  What happens here (optional)
                  <textarea className={field} rows={2} value={s.description} maxLength={JOURNEY_LIMITS.stationDescription} onChange={(e) => patchStation(s.id, { description: e.target.value })} />
                </label>
              </div>
            );
          })}
          {doc.stations.length === 0 && <p className="text-sm text-gray-500">No stations yet.</p>}
        </div>
      </section>

      <section className="app-card p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">2. Pathways</h2>
          <button type="button" onClick={addLine} disabled={doc.lines.length >= JOURNEY_LIMITS.lines} className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold" data-testid="add-line">
            + Add pathway
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">A pathway is a career route or persona, such as &ldquo;Aspiring Headteacher&rdquo;. Put stations on it in the order a learner should take them; put the same station on two pathways to make an interchange.</p>
        <div className="grid gap-5">
          {doc.lines.map((l, li) => {
            const stops = doc.stops[l.id] ?? [];
            const addable = doc.stations.filter((s) => !stops.includes(s.id));
            return (
              <div key={l.id} className="border border-gray-200 rounded-lg p-4 grid gap-3" data-testid="line-row">
                <div className="flex items-end gap-3">
                  <label className={label}>
                    Colour
                    <input type="color" value={l.color} onChange={(e) => update((d) => ({ ...d, lines: d.lines.map((x) => (x.id === l.id ? { ...x, color: e.target.value } : x)) }))} className="h-10 w-14 rounded border border-gray-300 bg-white p-1" aria-label="Pathway colour" />
                  </label>
                  <label className={label + " flex-1"}>
                    Pathway name
                    <input className={field} value={l.name} maxLength={JOURNEY_LIMITS.lineName} onChange={(e) => update((d) => ({ ...d, lines: d.lines.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)) }))} data-testid={`line-name-${li}`} />
                  </label>
                  <button type="button" onClick={() => removeLine(l.id)} className="text-xs font-semibold text-red-600 hover:underline pb-2.5">
                    Remove
                  </button>
                </div>
                <ol className="grid gap-1.5">
                  {stops.map((sid, i) => (
                    <li key={sid} className="flex items-center gap-2 text-sm">
                      <span className="inline-block w-3 h-3 rounded-full border-2 bg-white" style={{ borderColor: l.color }} aria-hidden="true" />
                      <span className="flex-1 truncate">
                        {i + 1}. {stationTitle(sid)}
                      </span>
                      <button type="button" onClick={() => moveStop(l.id, i, -1)} disabled={i === 0} className="px-2 py-0.5 rounded border border-gray-300 text-xs disabled:opacity-30" aria-label="Move earlier">
                        ↑
                      </button>
                      <button type="button" onClick={() => moveStop(l.id, i, 1)} disabled={i === stops.length - 1} className="px-2 py-0.5 rounded border border-gray-300 text-xs disabled:opacity-30" aria-label="Move later">
                        ↓
                      </button>
                      <button type="button" onClick={() => removeStop(l.id, i)} className="px-2 py-0.5 rounded border border-gray-300 text-xs" aria-label="Take off this pathway">
                        ✕
                      </button>
                    </li>
                  ))}
                  {stops.length === 0 && <li className="text-sm text-gray-500">No stops on this pathway yet.</li>}
                </ol>
                <select
                  className={field + " max-w-sm"}
                  value=""
                  onChange={(e) => addStop(l.id, e.target.value)}
                  disabled={addable.length === 0}
                  aria-label={`Add a station to ${l.name || "this pathway"}`}
                  data-testid={`line-add-stop-${li}`}
                >
                  <option value="">{addable.length === 0 ? "All stations are on this pathway" : "+ Add a station to this pathway…"}</option>
                  {addable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || "Untitled station"}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          {doc.lines.length === 0 && <p className="text-sm text-gray-500">No pathways yet.</p>}
        </div>
        {unplaced.length > 0 && doc.lines.length > 0 && (
          <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Not on any pathway yet, so not on the map: {unplaced.map((s) => s.title || "Untitled station").join(", ")}.
          </p>
        )}
      </section>

      <div className="flex items-center gap-4 sticky bottom-4">
        <button type="button" onClick={save} disabled={pending} className="app-btn-primary rounded-md px-6 py-3 text-sm font-semibold shadow" data-testid="save-journey">
          {pending ? "Saving…" : "Save journey"}
        </button>
        {status?.error && <p className="text-sm text-red-600 bg-white rounded px-2 py-1" role="alert">{status.error}</p>}
        {status?.success && <p className="text-sm text-emerald-700 bg-white rounded px-2 py-1" data-testid="journey-saved">Saved{doc.published ? " — it is now on your home page." : ". Tick “Add this journey to your academy’s home page” and save to publish it."}</p>}
        {status?.success && doc.published && <a href={homeHref} target="_blank" rel="noreferrer" className="text-sm font-semibold app-link bg-white rounded px-2 py-1">View home page ↗</a>}
        {dirty && !status && <p className="text-xs text-gray-500 bg-white rounded px-2 py-1">Unsaved changes</p>}
      </div>
    </div>
  );
}

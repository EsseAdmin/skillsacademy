// Explains, in plain words, why a learning journey is (or is not) visible on an academy's public home page.
// The public page shows a journey only when ALL of these hold; each failure gives a message and a fix.
import type { AcademyPage } from "@/lib/academyPage";
import { journeysSectionStatus } from "@/lib/academyPage";

export type JourneyIssueCode = "site_unpublished" | "journey_off" | "empty" | "design_missing" | "design_hidden";

export interface JourneyIssue {
  code: JourneyIssueCode;
  text: string;
  /** What the person can do (a page to open); omitted when the fix is on the same page. */
  fixLabel?: string;
  fixHref?: string;
}

export interface JourneyFacts {
  is_published: number;
  /** Stops placed on pathways (a journey with none is hidden). */
  stop_count: number;
}

/** Problems that affect every journey of the academy. */
export function siteJourneyIssues(opts: { slug: string; siteLive: boolean; design: AcademyPage | null; area: "admin" | "instructor" }): JourneyIssue[] {
  const out: JourneyIssue[] = [];
  if (!opts.siteLive) {
    out.push({
      code: "site_unpublished",
      text: "Your academy's public site isn't published yet, so visitors can't see any journey.",
      fixLabel: opts.area === "admin" ? "Publish your academy site" : undefined,
      fixHref: opts.area === "admin" ? `/a/${opts.slug}/admin/site` : undefined,
    });
  }
  if (opts.design) {
    const st = journeysSectionStatus(opts.design);
    if (st === "missing" || st === "hidden") {
      out.push({
        code: st === "missing" ? "design_missing" : "design_hidden",
        text:
          st === "missing"
            ? "Your designed home page has no “Learning journeys” block. It is added automatically when you put a journey on the home page; you can also place it yourself."
            : "The “Learning journeys” block on your designed home page is switched off.",
        fixLabel: opts.area === "admin" ? "Open the Page designer" : undefined,
        fixHref: opts.area === "admin" ? `/a/${opts.slug}/admin/designer` : undefined,
      });
    }
  }
  return out;
}

/** Problems with one journey (on top of the academy-wide ones). */
export function journeyIssues(j: JourneyFacts): JourneyIssue[] {
  const out: JourneyIssue[] = [];
  if (!j.is_published) out.push({ code: "journey_off", text: "This journey is switched off - use “Add to home page”." });
  if (j.stop_count === 0) out.push({ code: "empty", text: "No station has been placed on a pathway yet - an empty journey is not shown." });
  return out;
}

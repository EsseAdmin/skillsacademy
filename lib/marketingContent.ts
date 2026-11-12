import { MarketingPages, Plans, Academies } from "@/lib/queries";
import { isPortalHref } from "@/lib/superAdminPath";
import { parsePage, buildTokenContext, type HomePage, type TokenContext } from "@/lib/marketingPage";
import type { PlanView } from "@/components/MarketingSections";

/** The live page: what the super admin last published, or the original design. */
export async function loadPublishedHome(): Promise<HomePage> {
  const row = await MarketingPages.get("home");
  return withoutPortalLinks(parsePage(row?.published_json));
}

/** The Super Admin portal is private: no public page may link to it, even if an older saved page still does. */
function withoutPortalLinks(page: HomePage): HomePage {
  page.footer.links = page.footer.links.filter((l) => !isPortalHref(l.href));
  page.nav.links = page.nav.links.filter((l) => !isPortalHref(l.href));
  return page;
}

/** The page being edited: the saved draft, or the live page when there is no draft. */
export async function loadDraftHome(): Promise<{ page: HomePage; hasDraft: boolean }> {
  const row = await MarketingPages.get("home");
  if (row?.draft_json) return { page: withoutPortalLinks(parsePage(row.draft_json)), hasDraft: true };
  return { page: withoutPortalLinks(parsePage(row?.published_json)), hasDraft: false };
}

/** The live numbers the page's {tokens} and pricing section read. */
export async function loadHomeData(): Promise<{ plans: PlanView[]; ctx: TokenContext }> {
  const plans = await Plans.all(true);
  const academyCount = (await Academies.all()).length;
  return { plans, ctx: buildTokenContext(plans, academyCount) };
}

import type { ReactNode } from "react";
import HelpAgent from "@/components/HelpAgent";
import { SUGGESTED_QUESTIONS } from "@/lib/helpGuide";
import { getSession } from "@/lib/auth";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";

// Every admin page gets the Help assistant. Only shown to a signed-in academy admin of this academy
// (each page still does its own access check).
export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const show = !!session && session.role === "ACADEMY_ADMIN" && session.academySlug === slug;
  // The widget sits outside the page's portal shell, so it gets the academy's brand colours itself.
  const academy = show ? await Academies.bySlug(slug) : undefined;
  const template = academy ? await Templates.byId(academy.template_id) : undefined;
  return (
    <>
      {children}
      {show && (
        <div style={template ? themeVars(template) : undefined}>
          <HelpAgent slug={slug} suggestions={SUGGESTED_QUESTIONS} />
        </div>
      )}
    </>
  );
}

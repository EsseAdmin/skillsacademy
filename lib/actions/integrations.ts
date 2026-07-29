"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/authz";
import { AcademyIntegrations } from "@/lib/queries";
import { createOAuthState } from "@/lib/integrations/oauthState";
import { buildZoomAuthorizeUrl, isZoomConfigured } from "@/lib/integrations/zoom";
import { buildMicrosoftAuthorizeUrl, isMicrosoftConfigured } from "@/lib/integrations/microsoft";

export async function connectZoom(slug: string) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  if (!isZoomConfigured()) {
    throw new Error(
      "Zoom isn't configured on this platform yet — the platform owner needs to set ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET (see DEPLOYMENT.md)."
    );
  }
  const state = await createOAuthState({
    academyId: session.academyId!,
    slug,
    userId: session.userId,
    provider: "zoom",
  });
  redirect(buildZoomAuthorizeUrl(state));
}

export async function connectMicrosoft(slug: string) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  if (!isMicrosoftConfigured()) {
    throw new Error(
      "Microsoft Teams isn't configured on this platform yet — the platform owner needs to set MS_CLIENT_ID and MS_CLIENT_SECRET (see DEPLOYMENT.md)."
    );
  }
  const state = await createOAuthState({
    academyId: session.academyId!,
    slug,
    userId: session.userId,
    provider: "microsoft",
  });
  redirect(buildMicrosoftAuthorizeUrl(state));
}

export async function disconnectIntegration(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const provider = String(formData.get("provider") || "") as "zoom" | "microsoft";
  if (provider !== "zoom" && provider !== "microsoft") return;
  await AcademyIntegrations.disconnect(session.academyId!, provider);
  revalidatePath(`/a/${slug}/admin/integrations`);
}

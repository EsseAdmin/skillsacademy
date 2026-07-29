import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { exchangeZoomCode, getZoomUser } from "@/lib/integrations/zoom";
import { encryptSecret } from "@/lib/crypto";
import { AcademyIntegrations } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const statePayload = state ? await verifyOAuthState(state) : null;
  const slug = statePayload?.slug;

  if (error) {
    return NextResponse.redirect(new URL(`/a/${slug ?? ""}/admin/integrations?error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !statePayload || statePayload.provider !== "zoom") {
    return NextResponse.redirect(new URL(`/a/${slug ?? ""}/admin/integrations?error=invalid_state`, req.url));
  }

  try {
    const tokens = await exchangeZoomCode(code);
    const zoomUser = await getZoomUser(tokens.access_token);
    await AcademyIntegrations.upsert({
      academy_id: statePayload.academyId,
      provider: "zoom",
      external_account_id: zoomUser.id,
      external_account_email: zoomUser.email,
      access_token_enc: encryptSecret(tokens.access_token),
      refresh_token_enc: encryptSecret(tokens.refresh_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope || "",
      connected_by: statePayload.userId,
    });
    return NextResponse.redirect(new URL(`/a/${statePayload.slug}/admin/integrations?connected=zoom`, req.url));
  } catch (err) {
    console.error("Zoom OAuth callback failed", err);
    return NextResponse.redirect(new URL(`/a/${statePayload.slug}/admin/integrations?error=zoom_connect_failed`, req.url));
  }
}

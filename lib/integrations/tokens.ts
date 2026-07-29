import { AcademyIntegrations } from "@/lib/queries";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { refreshZoomToken } from "./zoom";
import { refreshMicrosoftToken } from "./microsoft";

// Returns a live access token for an academy's Zoom/Microsoft connection,
// transparently refreshing it (and persisting the new tokens) if it's
// expired or about to expire. Returns null if the academy hasn't connected
// that provider.
export async function getValidAccessToken(academyId: string, provider: "zoom" | "microsoft"): Promise<string | null> {
  const integration = await AcademyIntegrations.byAcademyAndProvider(academyId, provider);
  if (!integration) return null;

  const expiresAt = new Date(integration.token_expires_at).getTime();
  const needsRefresh = Number.isNaN(expiresAt) || expiresAt - Date.now() < 5 * 60 * 1000; // refresh 5 min early

  if (!needsRefresh) {
    return decryptSecret(integration.access_token_enc);
  }

  const refreshToken = decryptSecret(integration.refresh_token_enc);
  if (provider === "zoom") {
    const fresh = await refreshZoomToken(refreshToken);
    await AcademyIntegrations.updateTokens(academyId, provider, {
      access_token_enc: encryptSecret(fresh.access_token),
      refresh_token_enc: encryptSecret(fresh.refresh_token),
      token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
    });
    return fresh.access_token;
  } else {
    const fresh = await refreshMicrosoftToken(refreshToken);
    await AcademyIntegrations.updateTokens(academyId, provider, {
      access_token_enc: encryptSecret(fresh.access_token),
      refresh_token_enc: encryptSecret(fresh.refresh_token),
      token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
    });
    return fresh.access_token;
  }
}

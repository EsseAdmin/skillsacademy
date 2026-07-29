// Shared helpers for the Zoom and Microsoft Teams OAuth integrations.
//
// Both providers use a standard OAuth 2.0 Authorization Code flow, but the
// *app registration* is done once by the platform owner (this app has one
// Zoom OAuth app and one Microsoft Entra app registration — see
// DEPLOYMENT.md), while each *academy* does its own consent flow to link
// its own Zoom account / Microsoft 365 tenant. That per-academy link is
// what's stored in the academy_integrations table.

export function appBaseUrl(): string {
  // Must match exactly what's registered as the redirect URI in the Zoom
  // OAuth app / Microsoft Entra app registration (see DEPLOYMENT.md).
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.URL) return process.env.URL.replace(/\/$/, ""); // Netlify build-time env var
  return "http://localhost:3000";
}

export function zoomRedirectUri(): string {
  return `${appBaseUrl()}/api/integrations/zoom/callback`;
}

export function microsoftRedirectUri(): string {
  return `${appBaseUrl()}/api/integrations/microsoft/callback`;
}

export class IntegrationConfigError extends Error {}
export class IntegrationApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
  }
}

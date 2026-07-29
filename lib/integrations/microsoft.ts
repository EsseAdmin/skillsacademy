import { microsoftRedirectUri, IntegrationConfigError, IntegrationApiError } from "./base";

// Microsoft identity platform OAuth 2.0 (Authorization Code flow) +
// Microsoft Graph onlineMeetings API client, for Microsoft Teams.
//
// Setup (done once by the platform owner, outside this app — see
// DEPLOYMENT.md): register a multi-tenant app in the Microsoft Entra admin
// center, add a redirect URI of `${APP_BASE_URL}/api/integrations/microsoft/callback`
// (platform type "Web"), add a client secret, and grant the delegated Graph
// permissions below (admin consent isn't required for these — they're
// standard delegated permissions a user consents to for themselves). Set
// MS_CLIENT_ID / MS_CLIENT_SECRET as environment variables.
//
// We use the `common` multi-tenant authorize/token endpoint so any
// academy's own Microsoft 365 tenant (or personal Microsoft account) can
// connect — each academy does its own "Connect Microsoft Teams" consent
// flow, and we store their resulting tokens in academy_integrations
// (encrypted — see src/lib/crypto.ts).

const AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const DEFAULT_SCOPES = "offline_access openid profile User.Read OnlineMeetings.ReadWrite";

function clientId(): string {
  const id = process.env.MS_CLIENT_ID;
  if (!id) throw new IntegrationConfigError("MS_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.MS_CLIENT_SECRET;
  if (!secret) throw new IntegrationConfigError("MS_CLIENT_SECRET is not set");
  return secret;
}

export function isMicrosoftConfigured(): boolean {
  return !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

/** Build the URL to send an academy admin to for the Microsoft consent screen. */
export function buildMicrosoftAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: process.env.MS_OAUTH_SCOPES || DEFAULT_SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface MsTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeMicrosoftCode(code: string): Promise<MsTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: microsoftRedirectUri(),
      grant_type: "authorization_code",
      scope: process.env.MS_OAUTH_SCOPES || DEFAULT_SCOPES,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new IntegrationApiError("Microsoft token exchange failed", res.status, body);
  return body as MsTokenResponse;
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<MsTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: process.env.MS_OAUTH_SCOPES || DEFAULT_SCOPES,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new IntegrationApiError("Microsoft token refresh failed", res.status, body);
  return body as MsTokenResponse;
}

interface MsUser {
  id: string;
  mail: string | null;
  userPrincipalName: string;
}

export async function getMicrosoftUser(accessToken: string): Promise<MsUser> {
  const res = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  if (!res.ok) throw new IntegrationApiError("Failed to fetch Microsoft user", res.status, body);
  return { id: body.id, mail: body.mail ?? null, userPrincipalName: body.userPrincipalName };
}

export interface CreateTeamsMeetingInput {
  subject: string;
  startDateTimeIso: string;
  endDateTimeIso: string;
}

export interface TeamsMeeting {
  id: string;
  joinWebUrl: string;
}

export async function createTeamsMeeting(accessToken: string, input: CreateTeamsMeetingInput): Promise<TeamsMeeting> {
  const res = await fetch(`${GRAPH_BASE}/me/onlineMeetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: input.subject,
      startDateTime: input.startDateTimeIso,
      endDateTime: input.endDateTimeIso,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new IntegrationApiError("Failed to create Teams meeting", res.status, body);
  return { id: body.id, joinWebUrl: body.joinWebUrl };
}

import { appBaseUrl, zoomRedirectUri, IntegrationConfigError, IntegrationApiError } from "./base";

// Zoom OAuth 2.0 (Authorization Code flow) + Meetings API client.
//
// Setup (done once by the platform owner, outside this app — see
// DEPLOYMENT.md): register a "General" OAuth app at
// https://marketplace.zoom.us/, set its redirect URI to
// `${APP_BASE_URL}/api/integrations/zoom/callback`, add the scopes below (or
// whatever equivalent granular scopes your Zoom app dashboard offers — Zoom
// has changed its scope-naming scheme over time, so treat ZOOM_OAUTH_SCOPES
// as something to double check against your own app's Scopes tab), and set
// ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET as environment variables.
//
// Each academy then does its own "Connect Zoom" consent flow, and we store
// their resulting tokens in academy_integrations (encrypted — see
// src/lib/crypto.ts).

const AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
const TOKEN_URL = "https://zoom.us/oauth/token";
const API_BASE = "https://api.zoom.us/v2";

const DEFAULT_SCOPES = "meeting:write:meeting meeting:write:meeting:admin user:read:user";

function clientId(): string {
  const id = process.env.ZOOM_CLIENT_ID;
  if (!id) throw new IntegrationConfigError("ZOOM_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.ZOOM_CLIENT_SECRET;
  if (!secret) throw new IntegrationConfigError("ZOOM_CLIENT_SECRET is not set");
  return secret;
}

export function isZoomConfigured(): boolean {
  return !!(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

/** Build the URL to send an academy admin to for the Zoom consent screen. */
export function buildZoomAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: zoomRedirectUri(),
    state,
    scope: process.env.ZOOM_OAUTH_SCOPES || DEFAULT_SCOPES,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

function basicAuthHeader(): string {
  return "Basic " + Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
}

export async function exchangeZoomCode(code: string): Promise<ZoomTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: zoomRedirectUri(),
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new IntegrationApiError("Zoom token exchange failed", res.status, body);
  return body as ZoomTokenResponse;
}

export async function refreshZoomToken(refreshToken: string): Promise<ZoomTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new IntegrationApiError("Zoom token refresh failed", res.status, body);
  return body as ZoomTokenResponse;
}

interface ZoomUser {
  id: string;
  email: string;
}

export async function getZoomUser(accessToken: string): Promise<ZoomUser> {
  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  if (!res.ok) throw new IntegrationApiError("Failed to fetch Zoom user", res.status, body);
  return { id: body.id, email: body.email };
}

export interface CreateZoomMeetingInput {
  topic: string;
  startTimeIso: string | null; // null => instant/no fixed time meeting
  durationMinutes: number;
  timezone?: string;
}

export interface ZoomMeeting {
  id: string;
  join_url: string;
  start_url: string;
  password: string | null;
}

export async function createZoomMeeting(accessToken: string, input: CreateZoomMeetingInput): Promise<ZoomMeeting> {
  const res = await fetch(`${API_BASE}/users/me/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: input.topic,
      type: input.startTimeIso ? 2 : 1, // 2 = scheduled, 1 = instant
      start_time: input.startTimeIso ?? undefined,
      duration: input.durationMinutes,
      timezone: input.timezone || "UTC",
      settings: {
        join_before_host: true,
        waiting_room: false,
        host_video: true,
        participant_video: true,
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new IntegrationApiError("Failed to create Zoom meeting", res.status, body);
  return { id: String(body.id), join_url: body.join_url, start_url: body.start_url, password: body.password ?? null };
}

export { appBaseUrl };

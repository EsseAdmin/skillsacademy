import type { OAuthMeetingProvider, TokenResponse, ProviderIdentity, CreatedMeeting, MeetingInput } from './types';

// Microsoft Teams via Entra ID multi-tenant OAuth + Microsoft Graph.
// https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
// https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings

const CLIENT_ID = process.env.MS_CLIENT_ID!;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET!;
const REDIRECT_URI = process.env.MS_REDIRECT_URI!;
const AUTHORITY = process.env.MS_AUTHORITY || 'https://login.microsoftonline.com/common';
const SCOPES = ['offline_access', 'User.Read', 'OnlineMeetings.ReadWrite'].join(' ');

async function jsonOrThrow(res: Response, label: string) {
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export const teams: OAuthMeetingProvider = {
  name: 'teams',

  getAuthorizeUrl(state: string): string {
    const url = new URL(`${AUTHORITY}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);
    return url.toString();
  },

  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
      }),
    });
    return jsonOrThrow(res, 'Microsoft token exchange');
  },

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: SCOPES,
      }),
    });
    return jsonOrThrow(res, 'Microsoft token refresh');
  },

  async getUserInfo(accessToken: string): Promise<ProviderIdentity> {
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const user = await jsonOrThrow(res, 'Graph get user');
    return { id: user.id, email: user.mail ?? user.userPrincipalName ?? null };
  },

  async createMeeting(accessToken: string, input: MeetingInput): Promise<CreatedMeeting> {
    const start = new Date(input.start_time);
    const end = new Date(start.getTime() + input.duration_minutes * 60_000);
    const res = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: input.topic,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
      }),
    });
    const meeting = await jsonOrThrow(res, 'Graph create meeting');
    return { external_meeting_id: meeting.id, join_url: meeting.joinWebUrl, host_url: meeting.joinWebUrl };
  },

  async revoke(): Promise<void> {
    // Microsoft Graph has no per-app delegated-token revoke endpoint; the
    // admin revokes access from myapps.microsoft.com on their own tenant.
    // We just stop using the stored token locally.
  },
};

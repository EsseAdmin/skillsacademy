import type { OAuthMeetingProvider, TokenResponse, ProviderIdentity, CreatedMeeting, MeetingInput } from './types';

// Zoom OAuth ("General App") + Meetings API.
// https://developers.zoom.us/docs/integrations/oauth/
// https://developers.zoom.us/docs/api/meetings/

const CLIENT_ID = process.env.ZOOM_CLIENT_ID!;
const CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET!;
const REDIRECT_URI = process.env.ZOOM_REDIRECT_URI!;

function basicAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
}

async function jsonOrThrow(res: Response, label: string) {
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export const zoom: OAuthMeetingProvider = {
  name: 'zoom',

  getAuthorizeUrl(state: string): string {
    const url = new URL('https://zoom.us/oauth/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('state', state);
    return url.toString();
  },

  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const res = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
    });
    return jsonOrThrow(res, 'Zoom token exchange');
  },

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const res = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    return jsonOrThrow(res, 'Zoom token refresh');
  },

  async getUserInfo(accessToken: string): Promise<ProviderIdentity> {
    const res = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const user = await jsonOrThrow(res, 'Zoom get user');
    return { id: user.id, email: user.email ?? null };
  },

  async createMeeting(accessToken: string, input: MeetingInput): Promise<CreatedMeeting> {
    const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: input.topic,
        type: 2,
        start_time: input.start_time,
        duration: input.duration_minutes,
        settings: { join_before_host: false, waiting_room: true },
      }),
    });
    const meeting = await jsonOrThrow(res, 'Zoom create meeting');
    return { external_meeting_id: String(meeting.id), join_url: meeting.join_url, host_url: meeting.start_url };
  },

  async revoke(accessToken: string): Promise<void> {
    await fetch('https://zoom.us/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken }),
    }).catch(() => {});
  },
};

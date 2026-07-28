export type ProviderName = 'zoom' | 'teams';

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export type ProviderIdentity = {
  id: string;
  email: string | null;
};

export type CreatedMeeting = {
  external_meeting_id: string;
  join_url: string;
  host_url: string;
};

export type MeetingInput = {
  topic: string;
  start_time: string; // ISO 8601
  duration_minutes: number;
};

export interface OAuthMeetingProvider {
  name: ProviderName;
  getAuthorizeUrl(state: string): string;
  exchangeCodeForToken(code: string): Promise<TokenResponse>;
  refreshToken(refreshToken: string): Promise<TokenResponse>;
  getUserInfo(accessToken: string): Promise<ProviderIdentity>;
  createMeeting(accessToken: string, input: MeetingInput): Promise<CreatedMeeting>;
  revoke(accessToken: string): Promise<void>;
}

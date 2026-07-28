import { zoom } from './zoom';
import { teams } from './teams';
import type { OAuthMeetingProvider, ProviderName } from './types';

export const providers: Record<ProviderName, OAuthMeetingProvider> = { zoom, teams };

export function getProvider(name: string): OAuthMeetingProvider {
  const p = providers[name as ProviderName];
  if (!p) throw Object.assign(new Error(`Unknown provider: ${name}`), { status: 400 });
  return p;
}

export * from './types';

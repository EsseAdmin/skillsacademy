import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { consumeOAuthState, saveConnection } from '@/lib/integrationsService';
import type { ProviderName } from '@/lib/providers/types';

// Hit by the provider with a one-time code, and writes to the database —
// never prerender it.
export const dynamic = 'force-dynamic';

// No requireAcademyAdmin() here on purpose — this is the OAuth redirect
// target hit directly by Zoom/Microsoft, not an authenticated fetch from
// your own frontend. The oauth_states row (created only for an
// already-authenticated admin in the /connect route) is what proves this
// callback is legitimate; the `state` param is single-use and consumed below.
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await params;
  const provider = getProvider(providerName);
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code/state.' }, { status: 400 });
  }

  const stateRow = await consumeOAuthState(state, provider.name as ProviderName);
  if (!stateRow) {
    return NextResponse.json({ error: 'Invalid or expired OAuth state.' }, { status: 400 });
  }

  try {
    const tokenResp = await provider.exchangeCodeForToken(code);
    const identity = await provider.getUserInfo(tokenResp.access_token);

    await saveConnection({
      academyId: stateRow.academy_id,
      provider: provider.name as ProviderName,
      email: identity.email,
      externalId: identity.id,
      accessToken: tokenResp.access_token,
      refreshToken: tokenResp.refresh_token,
      expiresIn: tokenResp.expires_in,
      scope: tokenResp.scope,
      userId: stateRow.user_id,
    });

    return NextResponse.redirect(
      new URL(`/admin/integrations?connected=${provider.name}`, req.nextUrl.origin)
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.json({ error: 'Failed to complete connection. Please try again.' }, { status: 500 });
  }
}

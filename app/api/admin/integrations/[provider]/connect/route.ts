import { NextRequest, NextResponse } from 'next/server';
import { requireAcademyAdmin } from '@/lib/auth';
import { getProvider } from '@/lib/providers';
import { createOAuthState } from '@/lib/integrationsService';
import type { ProviderName } from '@/lib/providers/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider: providerName } = await params;
    const admin = await requireAcademyAdmin();
    const provider = getProvider(providerName);

    const state = await createOAuthState(admin.academyId, provider.name as ProviderName, admin.userId);
    return NextResponse.redirect(provider.getAuthorizeUrl(state));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

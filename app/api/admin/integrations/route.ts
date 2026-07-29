import { NextResponse } from 'next/server';
import { requireAcademyAdmin } from '@/lib/auth';
import { listIntegrations } from '@/lib/integrationsService';

// Reads a session cookie and the database on every call — never prerender it.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await requireAcademyAdmin();
    const integrations = await listIntegrations(admin.academyId);
    return NextResponse.json(integrations);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

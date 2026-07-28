import { NextResponse } from 'next/server';
import { requireAcademyAdmin } from '@/lib/auth';
import { listIntegrations } from '@/lib/integrationsService';

export async function GET() {
  try {
    const admin = await requireAcademyAdmin();
    const integrations = await listIntegrations(admin.academyId);
    return NextResponse.json(integrations);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

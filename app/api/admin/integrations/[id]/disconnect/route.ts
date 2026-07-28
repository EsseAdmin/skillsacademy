import { NextRequest, NextResponse } from 'next/server';
import { requireAcademyAdmin } from '@/lib/auth';
import { disconnectIntegration } from '@/lib/integrationsService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = await requireAcademyAdmin();
    const ok = await disconnectIntegration(Number(id), admin.academyId);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

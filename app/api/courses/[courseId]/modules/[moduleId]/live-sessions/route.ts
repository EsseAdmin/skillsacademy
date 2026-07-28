import { NextRequest, NextResponse } from 'next/server';
import { requireAcademyAdmin } from '@/lib/auth';
import { getProvider, providers } from '@/lib/providers';
import { getValidAccessToken, getConnectedIntegrationId } from '@/lib/integrationsService';
import pool from '@/lib/db';
import type { ProviderName } from '@/lib/providers/types';

/**
 * TODO — REQUIRED BEFORE USE: replace this with a real check against your
 * existing courses/modules tables, confirming `moduleId` (and `courseId`)
 * actually belong to `academyId`. This is a hard authorization boundary —
 * without it, an academy admin could create a live session (and burn your
 * connected Zoom/Teams account's quota) on another academy's module.
 * Left throwing on purpose so this can't ship silently insecure.
 */
async function assertModuleBelongsToAcademy(courseId: string, moduleId: string, academyId: number): Promise<void> {
  throw Object.assign(
    new Error(
      'assertModuleBelongsToAcademy() is not implemented — wire this up to your real courses/modules schema before using this route.'
    ),
    { status: 501 }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string; moduleId: string }> }
) {
  try {
    const { courseId, moduleId } = await params;
    const admin = await requireAcademyAdmin();
    await assertModuleBelongsToAcademy(courseId, moduleId, admin.academyId);

    const body = await req.json();
    const { provider: providerName, topic, start_time, duration_minutes } = body as {
      provider: string;
      topic: string;
      start_time: string;
      duration_minutes: number;
    };

    if (!providers[providerName as ProviderName]) {
      return NextResponse.json({ error: 'provider must be zoom or teams' }, { status: 400 });
    }
    if (!topic || !start_time || !duration_minutes) {
      return NextResponse.json({ error: 'topic, start_time, duration_minutes are required' }, { status: 400 });
    }

    const provider = getProvider(providerName);
    const integrationId = await getConnectedIntegrationId(admin.academyId, provider.name as ProviderName);
    if (!integrationId) {
      return NextResponse.json(
        { error: `Academy has no connected ${provider.name} account. Connect it first.` },
        { status: 409 }
      );
    }

    const accessToken = await getValidAccessToken(admin.academyId, provider.name as ProviderName);
    const meeting = await provider.createMeeting(accessToken, { topic, start_time, duration_minutes });

    const { rows } = await pool.query(
      `INSERT INTO live_sessions
         (academy_id, course_id, module_id, academy_integration_id, provider,
          external_meeting_id, join_url, host_url, topic, start_time, duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        admin.academyId,
        courseId,
        moduleId,
        integrationId,
        provider.name,
        meeting.external_meeting_id,
        meeting.join_url,
        meeting.host_url,
        topic,
        start_time,
        duration_minutes,
      ]
    );

    return NextResponse.json(
      {
        id: rows[0].id,
        provider: provider.name,
        join_url: meeting.join_url,
        host_url: meeting.host_url,
        start_time,
        duration_minutes,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Create live session error:', err);
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string; moduleId: string }> }
) {
  try {
    const { courseId, moduleId } = await params;
    const admin = await requireAcademyAdmin();
    await assertModuleBelongsToAcademy(courseId, moduleId, admin.academyId);

    const { rows } = await pool.query(
      `SELECT id, provider, join_url, topic, start_time, duration_minutes, status
       FROM live_sessions WHERE module_id = $1 ORDER BY start_time DESC`,
      [moduleId]
    );
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAcademyAdmin } from '@/lib/auth';
import { getProvider, providers } from '@/lib/providers';
import { getValidAccessToken, getConnectedIntegrationId } from '@/lib/integrationsService';
import pool from '@/lib/db';
import type { ProviderName } from '@/lib/providers/types';

/**
 * Authorization boundary: confirms the module is attached to the course *and*
 * that both belong to the caller's academy. Without this an academy admin could
 * create a live session (and burn the connected Zoom/Teams account's quota) on
 * another academy's module.
 *
 * Modules are linked to courses through the `course_modules` join table, and
 * both `courses` and `modules` carry their own `academy_id`; both are checked.
 */
async function assertModuleBelongsToAcademy(
  courseId: string,
  moduleId: string,
  academyId: string
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT 1
     FROM course_modules cm
     JOIN courses c ON c.id = cm.course_id
     JOIN modules m ON m.id = cm.module_id
     WHERE cm.course_id = $1
       AND cm.module_id = $2
       AND c.academy_id = $3
       AND m.academy_id = $3
     LIMIT 1`,
    [courseId, moduleId, academyId]
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('Module not found for this course.'), { status: 404 });
  }
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
         (id, academy_id, course_id, module_id, academy_integration_id, provider,
          external_meeting_id, join_url, host_url, topic, start_time, duration_minutes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        crypto.randomUUID(),
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
        new Date().toISOString(),
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
       FROM live_sessions
       WHERE module_id = $1 AND academy_id = $2
       ORDER BY start_time DESC`,
      [moduleId, admin.academyId]
    );
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

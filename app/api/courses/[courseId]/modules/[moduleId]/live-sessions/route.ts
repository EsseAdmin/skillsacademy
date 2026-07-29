import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAcademyAdmin } from '@/lib/auth';
import { getProvider, providers } from '@/lib/providers';
import {
  getValidAccessToken,
  getConnectedIntegrationId,
  createLiveSession,
  listLiveSessions,
} from '@/lib/integrationsService';
import type { ProviderName } from '@/lib/providers/types';

// Reads a session cookie and the database on every call — never prerender it.
export const dynamic = 'force-dynamic';

/**
 * Authorization boundary: confirms the module is attached to the course *and*
 * that both belong to the caller's academy. Without this an academy admin could
 * create a live session (and burn the connected Zoom/Teams account's quota) on
 * another academy's module.
 *
 * Modules are linked to courses through the `course_modules` join table, and
 * both `courses` and `modules` carry their own `academy_id`; both are checked.
 */
async function assertModuleBelongsToAcademy(courseId: string, moduleId: string, academyId: string): Promise<void> {
  throw Object.assign(
    new Error(
      'assertModuleBelongsToAcademy() is not implemented — wire this up to your real courses/modules schema before using this route.'
    ),
    { status: 501 }
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
    const integrationId = await getConnectedIntegrationId(admin.academyId, provider.name);
    if (!integrationId) {
      return NextResponse.json(
        { error: `Academy has no connected ${provider.name} account. Connect it first.` },
        { status: 409 }
      );
    }

    const accessToken = await getValidAccessToken(admin.academyId, provider.name);
    const meeting = await provider.createMeeting(accessToken, { topic, start_time, duration_minutes });

    const id = await createLiveSession({
      academyId: admin.academyId,
      courseId,
      moduleId,
      integrationId,
      provider: provider.name,
      externalMeetingId: meeting.external_meeting_id,
      joinUrl: meeting.join_url,
      hostUrl: meeting.host_url,
      topic,
      startTime: start_time,
      durationMinutes: duration_minutes,
    });

    return NextResponse.json(
      {
        id,
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

    const sessions = await listLiveSessions(moduleId, admin.academyId);
    return NextResponse.json(sessions);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

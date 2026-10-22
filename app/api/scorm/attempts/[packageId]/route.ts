import { NextRequest, NextResponse } from "next/server";
import { ScormPackages, ScormAttempts, Enrollments, ModuleCompletions, Modules, Courses } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { maybeIssueCertificate } from "@/lib/certificates";

// Backs the SCORM API shim (see components/ScormPlayer.tsx): the shim keeps
// LMSSetValue/SetValue calls in an in-memory cmi model (SCORM requires those
// calls to return synchronously) and calls this route on LMSCommit/Commit
// and LMSFinish/Terminate to actually persist progress. GET lets the shim
// resume a learner's suspend_data on relaunch.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ packageId: string }> }) {
  const { packageId } = await ctx.params;
  const session = await getSession();
  if (!session || session.role !== "LEARNER") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const pkg = await ScormPackages.byId(packageId);
  if (!pkg || pkg.academy_id !== session.academyId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attempt = await ScormAttempts.byPackageAndLearner(packageId, session.userId);
  return NextResponse.json({ attempt: attempt ?? null });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ packageId: string }> }) {
  const { packageId } = await ctx.params;
  const session = await getSession();
  if (!session || session.role !== "LEARNER") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const pkg = await ScormPackages.byId(packageId);
  if (!pkg || pkg.academy_id !== session.academyId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    courseId?: string;
    lesson_status?: string | null;
    completion_status?: string | null;
    success_status?: string | null;
    score_raw?: number | null;
    suspend_data?: string | null;
  };

  const courseId = body.courseId;
  let enrollmentId: string | null = null;
  if (courseId) {
    const course = await Courses.byId(courseId);
    if (course && course.academy_id === session.academyId) {
      const enr = await Enrollments.byCourseAndLearner(courseId, session.userId);
      if (enr && (enr.payment_status === "paid" || enr.payment_status === "free")) {
        enrollmentId = enr.id;
      }
    }
  }

  const attempt = await ScormAttempts.upsert({
    scorm_package_id: packageId,
    learner_id: session.userId,
    enrollment_id: enrollmentId,
    lesson_status: body.lesson_status,
    completion_status: body.completion_status,
    success_status: body.success_status,
    score_raw: body.score_raw,
    suspend_data: body.suspend_data,
  });

  if (enrollmentId && courseId && ScormAttempts.isPassingOrComplete(attempt)) {
    await ModuleCompletions.complete(enrollmentId, pkg.module_id);
    const total = (await Modules.listByCourse(courseId)).length;
    const done = (await ModuleCompletions.listByEnrollment(enrollmentId)).length;
    await Enrollments.setProgress(enrollmentId, total > 0 ? Math.round((done / total) * 100) : 0);
    await maybeIssueCertificate(courseId, session.userId);
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { Academies, Courses } from "@/lib/queries";
import { courseFunnel, courseLearners, courseStats, learnerStats, moduleStats, parseRange, pct, rangeFrom, toCsv, LEARNER_STATES } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// CSV downloads of the analytics reports. Academy admins of THIS academy only.
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await getSession();
  if (!session || session.role !== "ACADEMY_ADMIN" || session.academySlug !== slug || !session.academyId) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const academy = await Academies.bySlug(slug);
  if (!academy || academy.id !== session.academyId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const report = req.nextUrl.searchParams.get("report") || "";
  const range = parseRange(req.nextUrl.searchParams.get("range"));
  const from = rangeFrom(range);
  let name = report;
  let csv: string;

  if (report === "courses") {
    const rows = await courseStats(academy.id, from);
    csv = toCsv(
      ["Course", "Published", "Modules", "Enrolled", "New enrolments in range", "Finished", "Finished %", "Average progress %", "Stalled", "Average quiz score % in range"],
      rows.map((c) => [c.title, c.is_published ? "yes" : "no", c.modules, c.enrolled, c.newEnrolments, c.completed, pct(c.completed, c.enrolled), c.avgProgress, c.stalled, c.avgQuizScore ?? ""])
    );
  } else if (report === "modules") {
    const { rows } = await moduleStats(academy.id, from, { sort: "attention", limit: 5000, offset: 0 });
    csv = toCsv(
      ["Module", "Type", "In courses", "Learners who can reach it", "Completed", "Completion rate %", "Completed in range"],
      rows.map((m) => [m.title, m.content_type, m.courses, m.reached, m.completed, pct(m.completed, m.reached), m.completedInPeriod])
    );
  } else if (report === "learners") {
    const { rows } = await learnerStats(academy.id, { limit: 10000, offset: 0 });
    csv = toCsv(
      ["Name", "Email", "Status", "Courses", "Finished", "Average progress %", "Last active", "Joined"],
      rows.map((l) => [l.name, l.email, LEARNER_STATES[l.state], l.courses, l.completed, l.avgProgress, l.lastActive ?? "", l.joinedAt])
    );
  } else if (report.startsWith("course:")) {
    const courseId = report.slice("course:".length);
    const course = await Courses.byId(courseId);
    if (!course || course.academy_id !== academy.id) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const [funnel, learners] = await Promise.all([courseFunnel(academy.id, courseId), courseLearners(academy.id, courseId, 10000)]);
    name = `course-${course.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "report"}`;
    csv =
      toCsv(["Module", "Type", "Enrolled", "Completed", "Completion rate %", "Quiz attempts", "Quiz average %", "Quiz pass rate %"], funnel.map((m) => [m.title, m.content_type, m.reached, m.completed, pct(m.completed, m.reached), m.attempts ?? "", m.avgScore ?? "", m.passRate ?? ""])) +
      "\r\n" +
      toCsv(["Learner", "Email", "Progress %", "Modules done", "Enrolled", "Last active"], learners.map((l) => [l.name, l.email, l.progress, l.modulesDone, l.enrolledAt, l.lastActive])).replace("﻿", "");
  } else {
    return NextResponse.json({ error: "Unknown report." }, { status: 400 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-${name}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

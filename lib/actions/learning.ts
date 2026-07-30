"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Courses, Enrollments, ModuleCompletions, Modules, Payments } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { maybeIssueCertificate } from "@/lib/certificates";
import type { FormState } from "./auth";

export async function enrollFree(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const courseId = String(formData.get("courseId") || "");
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== session.academyId) return;
  const existing = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (existing) {
    redirect(`/a/${slug}/learner/courses/${courseId}`);
  }
  if (course.price_pence > 0) {
    redirect(`/a/${slug}/learner/checkout/${courseId}`);
  }
  await Enrollments.create({ academy_id: session.academyId!, course_id: courseId, learner_id: session.userId, payment_status: "free" });
  revalidatePath(`/a/${slug}/learner`);
  redirect(`/a/${slug}/learner/courses/${courseId}`);
}

export async function enrollLearnerManually(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const courseId = String(formData.get("courseId") || "");
  const learnerId = String(formData.get("learnerId") || "");
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== session.academyId) return;
  const existing = await Enrollments.byCourseAndLearner(courseId, learnerId);
  if (existing) return;
  await Enrollments.create({ academy_id: session.academyId!, course_id: courseId, learner_id: learnerId, payment_status: "free" });
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/learners`);
  revalidatePath(`/a/${slug}/${area}/courses/${courseId}`);
  revalidatePath(`/a/${slug}/admin/people`);
}

export async function checkoutCourse(slug: string, courseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== session.academyId) return { error: "Course not found." };

  const cardNumber = String(formData.get("cardNumber") || "").replace(/\s+/g, "");
  const expiry = String(formData.get("expiry") || "");
  const cvc = String(formData.get("cvc") || "");
  const nameOnCard = String(formData.get("nameOnCard") || "");

  if (!/^\d{12,19}$/.test(cardNumber)) return { error: "Enter a valid card number." };
  if (!/^\d{2}\s*\/\s*\d{2}$/.test(expiry)) return { error: "Enter a valid expiry (MM/YY)." };
  if (!/^\d{3,4}$/.test(cvc)) return { error: "Enter a valid CVC." };
  if (!nameOnCard.trim()) return { error: "Enter the name on the card." };

  let enrollment = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (!enrollment) {
    enrollment = await Enrollments.create({
      academy_id: session.academyId!,
      course_id: courseId,
      learner_id: session.userId,
      payment_status: "unpaid",
    });
  }
  if (enrollment.payment_status !== "paid") {
    await Payments.create({
      academy_id: session.academyId!,
      learner_id: session.userId,
      course_id: courseId,
      amount_pence: course.price_pence,
      card_last4: cardNumber.slice(-4),
    });
    await Enrollments.markPaid(enrollment.id);
  }

  revalidatePath(`/a/${slug}/learner`);
  redirect(`/a/${slug}/learner/courses/${courseId}?paid=1`);
}

export async function markModuleComplete(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const courseId = String(formData.get("courseId") || "");
  const moduleId = String(formData.get("moduleId") || "");
  const enrollment = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (!enrollment) return;
  await ModuleCompletions.complete(enrollment.id, moduleId);
  const total = (await Modules.listByCourse(courseId)).length;
  const done = (await ModuleCompletions.listByEnrollment(enrollment.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  await Enrollments.setProgress(enrollment.id, pct);
  await maybeIssueCertificate(courseId, session.userId);
  revalidatePath(`/a/${slug}/learner/courses/${courseId}`);
  revalidatePath(`/a/${slug}/learner`);
}

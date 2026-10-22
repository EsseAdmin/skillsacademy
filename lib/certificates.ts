import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Courses, Enrollments, ModuleCompletions, Modules, Quizzes, QuizAttempts, Certificates, Academies, Users } from "@/lib/queries";
import { saveFile } from "@/lib/storage";
import { generateCertificateNumber } from "@/lib/crypto";

/**
 * Certification trigger (confirmed with the customer): a learner earns a
 * course's certificate only once BOTH conditions hold —
 *   (a) every module in the course is recorded complete for their
 *       enrollment (module_completions — this already covers TEXT/URL/FILE
 *       "mark complete", LIVE_SESSION "mark complete", QUIZ modules that
 *       auto-complete on a passing attempt, and SCORM modules that
 *       auto-complete when the SCORM runtime reports completion), AND
 *   (b) every quiz attached to the course (whether tied to a specific
 *       module or a standalone course-level assessment) has a passing
 *       attempt on record for that learner.
 * If the course has no modules and no quizzes at all, certification is not
 * auto-issued (there's nothing to have completed) — an admin can still see
 * this is a misconfigured course via `certification_enabled` with 0 modules.
 *
 * Safe to call after any progress-changing event (module completion, quiz
 * submission, SCORM sync) — it's idempotent (Certificates.create is
 * ON CONFLICT DO NOTHING) and cheap enough to run inline.
 */
export async function maybeIssueCertificate(courseId: string, learnerId: string): Promise<void> {
  const course = await Courses.byId(courseId);
  if (!course || !course.certification_enabled) return;

  const existing = await Certificates.byCourseAndLearner(courseId, learnerId);
  if (existing) return;

  const enrollment = await Enrollments.byCourseAndLearner(courseId, learnerId);
  if (!enrollment) return;

  const modules = await Modules.listByCourse(courseId);
  const completedModuleIds = new Set(await ModuleCompletions.listByEnrollment(enrollment.id));
  const allModulesComplete = modules.length > 0 && modules.every((m) => completedModuleIds.has(m.id));
  if (!allModulesComplete) return;

  const quizzes = await Quizzes.listByCourse(courseId);
  for (const quiz of quizzes) {
    const passed = await QuizAttempts.hasPassed(quiz.id, learnerId);
    if (!passed) return;
  }

  const academy = await Academies.byId(course.academy_id);
  if (!academy) return;
  const learner = await Users.byId(learnerId);
  if (!learner) return;

  const certNumber = generateCertificateNumber();
  const pdfBytes = await generateCertificatePdf({
    learnerName: learner.name,
    courseTitle: course.title,
    academyName: academy.name,
    certificateNumber: certNumber,
    issuedDateLabel: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  });

  const pdfPath = `certificates/${certNumber}.pdf`;
  await saveFile(pdfPath, Buffer.from(pdfBytes));

  await Certificates.create({
    academy_id: course.academy_id,
    course_id: courseId,
    learner_id: learnerId,
    enrollment_id: enrollment.id,
    certificate_number: certNumber,
    pdf_path: pdfPath,
  });
}

export async function generateCertificatePdf(input: {
  learnerName: string;
  courseTitle: string;
  academyName: string;
  certificateNumber: string;
  issuedDateLabel: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape (points)
  const { width, height } = page.getSize();

  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifRegular = await doc.embedFont(StandardFonts.TimesRoman);
  const navy = rgb(0.05, 0.09, 0.2);
  const gold = rgb(0.7, 0.56, 0.15);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, borderColor: gold, borderWidth: 3 });
  page.drawRectangle({ x: 30, y: 30, width: width - 60, height: height - 60, borderColor: navy, borderWidth: 1 });

  const centerText = (text: string, y: number, font = serifRegular, size = 14, color = navy) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
  };

  centerText("CERTIFICATE OF COMPLETION", height - 110, serif, 28, navy);
  centerText(input.academyName, height - 150, serifRegular, 14, gold);
  centerText("This certifies that", height - 220, serifRegular, 13);
  centerText(input.learnerName, height - 260, serif, 26, navy);
  centerText("has successfully completed the course", height - 300, serifRegular, 13);
  centerText(input.courseTitle, height - 335, serif, 20, navy);
  centerText(`Issued ${input.issuedDateLabel}`, 90, serifRegular, 11);
  centerText(`Certificate No. ${input.certificateNumber}`, 70, serifRegular, 11);

  return doc.save();
}

import { Certificates, Courses, Users, Academies } from "@/lib/queries";

export default async function CertificateVerificationPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const certificate = await Certificates.byCertificateNumber(number);

  if (!certificate) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-3">❌</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Certificate not found</h1>
          <p className="text-sm text-gray-500">
            No certificate matches number <span className="font-mono">{number}</span>. Double-check the number and try again.
          </p>
        </div>
      </main>
    );
  }

  const [course, learner, academy] = await Promise.all([
    Courses.byId(certificate.course_id),
    Users.byId(certificate.learner_id),
    Academies.byId(certificate.academy_id),
  ]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Certificate verified</h1>
        <p className="text-sm text-gray-500 mb-6">This certificate is valid and was issued by {academy?.name || "the academy"}.</p>

        <div className="text-left space-y-3 border-t border-gray-100 pt-6">
          <div>
            <div className="text-xs text-gray-400">Certificate holder</div>
            <div className="text-sm font-semibold text-gray-900">{learner?.name || "Unknown"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Course</div>
            <div className="text-sm font-semibold text-gray-900">{course?.title || "Unknown course"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Issued</div>
            <div className="text-sm text-gray-700">{new Date(certificate.issued_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Certificate number</div>
            <div className="text-sm font-mono text-gray-700">{certificate.certificate_number}</div>
          </div>
        </div>

        <a
          href={`/api/certificates/${certificate.id}`}
          className="inline-block mt-6 rounded-md px-5 py-2.5 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800"
        >
          Download PDF
        </a>
      </div>
    </main>
  );
}

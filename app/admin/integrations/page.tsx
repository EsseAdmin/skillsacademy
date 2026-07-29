import { requireAcademyAdmin, type AcademyAdmin } from '@/lib/auth';
import { listIntegrations } from '@/lib/integrationsService';
import IntegrationsClient from './IntegrationsClient';

// Reads the admin's session cookie and the database on every request.
export const dynamic = 'force-dynamic';

// Adjust the import path above (@/lib/...) if this app's tsconfig path
// alias differs — check tsconfig.json's "paths" entry.

export default async function IntegrationsPage() {
  // Every API route in this feature maps a thrown auth error to its `status`.
  // A server component has no such wrapper, so an unauthenticated visitor
  // would otherwise escape as an uncaught throw and render a bare 500.
  let admin: AcademyAdmin;
  try {
    admin = await requireAcademyAdmin();
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-10">
          <h1 className="text-xl font-semibold text-gray-900">Academy integrations</h1>
          <p className="mt-2 text-sm text-gray-600">
            {err.status === 401
              ? 'Sign in as an academy administrator to manage integrations.'
              : 'Your account does not have administrator access to this academy.'}
          </p>
        </main>
      );
    }
    throw err;
  }

  const integrations = await listIntegrations(admin.academyId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Academy integrations</h1>
      <p className="mt-2 text-sm text-gray-600">
        Connect your organisation&rsquo;s Zoom and/or Microsoft Teams account. Once connected, any
        course or module in your academy can host live sessions through it.
      </p>
      <IntegrationsClient initialIntegrations={integrations} />
    </main>
  );
}

import { requireAcademyAdmin } from '@/lib/auth';
import { listIntegrations } from '@/lib/integrationsService';
import IntegrationsClient from './IntegrationsClient';

// Adjust the import path above (@/lib/...) if this app's tsconfig path
// alias differs — check tsconfig.json's "paths" entry.

export default async function IntegrationsPage() {
  const admin = await requireAcademyAdmin();
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

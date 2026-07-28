'use client';

import { useState } from 'react';
import type { IntegrationSummary } from '@/lib/integrationsService';

const PROVIDER_LABEL: Record<string, string> = { zoom: 'Zoom', teams: 'Microsoft Teams' };
const STATUS_STYLES: Record<string, string> = {
  connected: 'bg-green-50 text-green-700',
  disconnected: 'bg-gray-100 text-gray-600',
  none: 'bg-gray-100 text-gray-600',
  error: 'bg-red-50 text-red-700',
};

export default function IntegrationsClient({
  initialIntegrations,
}: {
  initialIntegrations: IntegrationSummary[];
}) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const byProvider = Object.fromEntries(integrations.map((i) => [i.provider, i]));

  async function disconnect(id: number) {
    await fetch(`/api/admin/integrations/${id}/disconnect`, { method: 'POST' });
    const res = await fetch('/api/admin/integrations');
    setIntegrations(await res.json());
  }

  return (
    <div className="mt-6 space-y-3">
      {(['zoom', 'teams'] as const).map((provider) => {
        const conn = byProvider[provider];
        const status = conn?.status ?? 'none';
        return (
          <div
            key={provider}
            className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
          >
            <div>
              <div className="font-medium text-gray-900">{PROVIDER_LABEL[provider]}</div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[status]}`}>{status}</span>
                {conn?.external_account_email && <span className="text-gray-500">{conn.external_account_email}</span>}
              </div>
            </div>
            {status === 'connected' ? (
              <button
                onClick={() => disconnect(conn.id)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Disconnect
              </button>
            ) : (
              <a
                href={`/api/admin/integrations/${provider}/connect`}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                Connect {PROVIDER_LABEL[provider]}
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

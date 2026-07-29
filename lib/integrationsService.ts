import crypto from 'node:crypto';
import { query } from './db';
import { encrypt, decrypt } from './crypto';
import { getProvider } from './providers';
import type { ProviderName } from './providers/types';

// This database stores ids as application-generated TEXT UUIDs and timestamps
// as ISO-8601 TEXT, so both are produced here rather than by the database.
const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

export type IntegrationSummary = {
  id: string;
  provider: ProviderName;
  status: 'connected' | 'disconnected' | 'error';
  external_account_email: string | null;
  connected_at: string;
  updated_at: string;
};

type IntegrationRow = {
  id: string;
  academy_id: string;
  provider: ProviderName;
  status: string;
  external_account_email: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
};

export async function listIntegrations(academyId: string): Promise<IntegrationSummary[]> {
  const { rows } = await query<IntegrationSummary>(
    `SELECT id, provider, status, external_account_email, connected_at, updated_at
     FROM academy_integrations WHERE academy_id = $1 ORDER BY provider`,
    [academyId]
  );
  return rows;
}

export async function createOAuthState(academyId: string, provider: ProviderName, userId: string): Promise<string> {
  const state = crypto.randomBytes(24).toString('base64url');
  await query(
    `INSERT INTO oauth_states (state, academy_id, provider, user_id, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [state, academyId, provider, userId, nowIso()]
  );
  return state;
}

export async function consumeOAuthState(state: string, provider: ProviderName) {
  const { rows } = await query<{ academy_id: string; provider: ProviderName; user_id: string }>(
    `DELETE FROM oauth_states WHERE state = $1 RETURNING *`,
    [state]
  );
  const row = rows[0];
  if (!row || row.provider !== provider) return null;
  return row;
}

export async function saveConnection(params: {
  academyId: string;
  provider: ProviderName;
  email: string | null;
  externalId: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  userId: string;
}) {
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + (params.expiresIn ?? 3600) * 1000).toISOString();
  await query(
    `INSERT INTO academy_integrations
       (id, academy_id, provider, status, external_account_email, external_account_id,
        access_token_enc, refresh_token_enc, token_expires_at, scope, connected_by,
        connected_at, updated_at)
     VALUES ($1, $2, $3, 'connected', $4, $5, $6, $7, $8, $9, $10, $11, $11)
     ON CONFLICT (academy_id, provider) DO UPDATE SET
       status = 'connected',
       external_account_email = EXCLUDED.external_account_email,
       external_account_id = EXCLUDED.external_account_id,
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       token_expires_at = EXCLUDED.token_expires_at,
       scope = EXCLUDED.scope,
       connected_by = EXCLUDED.connected_by,
       updated_at = EXCLUDED.updated_at`,
    [
      newId(),
      params.academyId,
      params.provider,
      params.email,
      params.externalId,
      encrypt(params.accessToken),
      encrypt(params.refreshToken ?? null),
      expiresAt,
      params.scope ?? null,
      params.userId,
      timestamp,
    ]
  );
  // TODO: write an audit log entry here (who connected what, when).
}

export async function disconnectIntegration(id: string, academyId: string) {
  const { rows } = await query<IntegrationRow>(
    `SELECT * FROM academy_integrations WHERE id = $1 AND academy_id = $2`,
    [id, academyId]
  );
  const row = rows[0];
  if (!row) return false;

  const provider = getProvider(row.provider);
  try {
    await provider.revoke(decrypt(row.access_token_enc)!);
  } catch {
    // best-effort; disconnect proceeds regardless
  }

  await query(
    `UPDATE academy_integrations SET status = 'disconnected', updated_at = $2 WHERE id = $1`,
    [id, nowIso()]
  );
  // TODO: write an audit log entry here.
  return true;
}

// Resolves a valid, decrypted access token for an academy+provider,
// refreshing it first if it's expired or about to expire.
export async function getValidAccessToken(academyId: string, providerName: ProviderName): Promise<string> {
  const provider = getProvider(providerName);
  const { rows } = await query<IntegrationRow>(
    `SELECT * FROM academy_integrations WHERE academy_id = $1 AND provider = $2 AND status = 'connected'`,
    [academyId, providerName]
  );
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error(`Academy has no connected ${providerName} account.`), { status: 409 });
  }

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60_000) {
    return decrypt(row.access_token_enc)!;
  }

  const storedRefreshToken = decrypt(row.refresh_token_enc);
  if (!storedRefreshToken) {
    throw Object.assign(
      new Error(`The ${providerName} connection has expired and cannot be refreshed. Reconnect the account.`),
      { status: 409 }
    );
  }

  try {
    const refreshed = await provider.refreshToken(storedRefreshToken);
    const newExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
    await query(
      `UPDATE academy_integrations
       SET access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3, updated_at = $4
       WHERE id = $5`,
      [
        encrypt(refreshed.access_token),
        encrypt(refreshed.refresh_token ?? storedRefreshToken),
        newExpiresAt,
        nowIso(),
        row.id,
      ]
    );
    return refreshed.access_token;
  } catch (err) {
    await query(`UPDATE academy_integrations SET status = 'error', updated_at = $2 WHERE id = $1`, [
      row.id,
      nowIso(),
    ]);
    throw err;
  }
}

export async function getConnectedIntegrationId(academyId: string, providerName: ProviderName): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM academy_integrations WHERE academy_id = $1 AND provider = $2 AND status = 'connected'`,
    [academyId, providerName]
  );
  return rows[0]?.id ?? null;
}

export async function createLiveSession(params: {
  academyId: string;
  courseId: string;
  moduleId: string;
  integrationId: string;
  provider: ProviderName;
  externalMeetingId: string;
  joinUrl: string;
  hostUrl: string;
  topic: string;
  startTime: string;
  durationMinutes: number;
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO live_sessions
       (id, academy_id, course_id, module_id, academy_integration_id, provider,
        external_meeting_id, join_url, host_url, topic, start_time, duration_minutes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      newId(),
      params.academyId,
      params.courseId,
      params.moduleId,
      params.integrationId,
      params.provider,
      params.externalMeetingId,
      params.joinUrl,
      params.hostUrl,
      params.topic,
      params.startTime,
      params.durationMinutes,
      nowIso(),
    ]
  );
  return rows[0].id;
}

export type LiveSessionSummary = {
  id: string;
  provider: ProviderName;
  join_url: string | null;
  topic: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  status: string;
};

export async function listLiveSessions(moduleId: string, academyId: string): Promise<LiveSessionSummary[]> {
  const { rows } = await query<LiveSessionSummary>(
    `SELECT id, provider, join_url, topic, start_time, duration_minutes, status
     FROM live_sessions WHERE module_id = $1 AND academy_id = $2 ORDER BY start_time DESC`,
    [moduleId, academyId]
  );
  return rows;
}

import crypto from 'node:crypto';
import pool from './db';
import { encrypt, decrypt } from './crypto';
import { getProvider } from './providers';
import type { ProviderName } from './providers/types';

export type IntegrationSummary = {
  id: number;
  provider: ProviderName;
  status: 'connected' | 'disconnected' | 'error';
  external_account_email: string | null;
  connected_at: string;
  updated_at: string;
};

export async function listIntegrations(academyId: number): Promise<IntegrationSummary[]> {
  const { rows } = await pool.query(
    `SELECT id, provider, status, external_account_email, connected_at, updated_at
     FROM academy_integrations WHERE academy_id = $1 ORDER BY provider`,
    [academyId]
  );
  return rows;
}

export async function createOAuthState(academyId: number, provider: ProviderName, userId: number): Promise<string> {
  const state = crypto.randomBytes(24).toString('base64url');
  await pool.query(
    `INSERT INTO oauth_states (state, academy_id, provider, user_id) VALUES ($1, $2, $3, $4)`,
    [state, academyId, provider, userId]
  );
  return state;
}

export async function consumeOAuthState(state: string, provider: ProviderName) {
  const { rows } = await pool.query(`DELETE FROM oauth_states WHERE state = $1 RETURNING *`, [state]);
  const row = rows[0];
  if (!row || row.provider !== provider) return null;
  return row as { academy_id: number; provider: ProviderName; user_id: number };
}

export async function saveConnection(params: {
  academyId: number;
  provider: ProviderName;
  email: string | null;
  externalId: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  userId: number;
}) {
  const expiresAt = new Date(Date.now() + (params.expiresIn ?? 3600) * 1000).toISOString();
  await pool.query(
    `INSERT INTO academy_integrations
       (academy_id, provider, status, external_account_email, external_account_id,
        access_token_enc, refresh_token_enc, token_expires_at, scope, connected_by_user_id)
     VALUES ($1, $2, 'connected', $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (academy_id, provider) DO UPDATE SET
       status = 'connected',
       external_account_email = EXCLUDED.external_account_email,
       external_account_id = EXCLUDED.external_account_id,
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       token_expires_at = EXCLUDED.token_expires_at,
       scope = EXCLUDED.scope,
       connected_by_user_id = EXCLUDED.connected_by_user_id,
       updated_at = now()`,
    [
      params.academyId,
      params.provider,
      params.email,
      params.externalId,
      encrypt(params.accessToken),
      encrypt(params.refreshToken ?? null),
      expiresAt,
      params.scope ?? null,
      params.userId,
    ]
  );
  // TODO: write an audit log entry here (who connected what, when).
}

export async function disconnectIntegration(id: number, academyId: number) {
  const { rows } = await pool.query(
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

  await pool.query(
    `UPDATE academy_integrations SET status = 'disconnected', updated_at = now() WHERE id = $1`,
    [id]
  );
  // TODO: write an audit log entry here.
  return true;
}

// Resolves a valid, decrypted access token for an academy+provider,
// refreshing it first if it's expired or about to expire.
export async function getValidAccessToken(academyId: number, providerName: ProviderName): Promise<string> {
  const provider = getProvider(providerName);
  const { rows } = await pool.query(
    `SELECT * FROM academy_integrations WHERE academy_id = $1 AND provider = $2 AND status = 'connected'`,
    [academyId, providerName]
  );
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error(`Academy has no connected ${providerName} account.`), { status: 409 });
  }

  const expiresAt = new Date(row.token_expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return decrypt(row.access_token_enc)!;
  }

  try {
    const refreshed = await provider.refreshToken(decrypt(row.refresh_token_enc)!);
    const newExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
    await pool.query(
      `UPDATE academy_integrations
       SET access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3, updated_at = now()
       WHERE id = $4`,
      [
        encrypt(refreshed.access_token),
        encrypt(refreshed.refresh_token ?? decrypt(row.refresh_token_enc)),
        newExpiresAt,
        row.id,
      ]
    );
    return refreshed.access_token;
  } catch (err) {
    await pool.query(`UPDATE academy_integrations SET status = 'error', updated_at = now() WHERE id = $1`, [row.id]);
    throw err;
  }
}

export async function getConnectedIntegrationId(academyId: number, providerName: ProviderName): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT id FROM academy_integrations WHERE academy_id = $1 AND provider = $2 AND status = 'connected'`,
    [academyId, providerName]
  );
  return rows[0]?.id ?? null;
}

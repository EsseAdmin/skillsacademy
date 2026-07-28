import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'INTEGRATIONS_ENCRYPTION_KEY must be set as a 64-character hex string (32 bytes). ' +
        'Generate one with: openssl rand -hex 32'
    );
  }
  return Buffer.from(hex, 'hex');
}

// Encrypts a plaintext string (an OAuth token) into a base64 blob containing
// iv + authTag + ciphertext, safe to store as TEXT in Postgres.
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decrypt(blob: string | null | undefined): string | null {
  if (blob == null) return null;
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

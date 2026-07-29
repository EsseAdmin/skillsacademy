import fs from "node:fs";
import path from "node:path";
import { getStore, type Store } from "@netlify/blobs";

// Netlify has no persistent disk, so uploaded module files (Word/PDF/PPT/
// etc.) live in Netlify Blobs when deployed there. `getStore()` throws
// synchronously if it can't find a Netlify Blobs context (no site linked,
// not running under `netlify dev`) — in that case we fall back to writing
// to local disk under UPLOAD_DIR, which is what makes `npm run dev` work
// out of the box for local development without needing the Netlify CLI.
// (For local dev with full parity, run `netlify dev` instead — Netlify's
// CLI provisions a local Blobs emulator automatically and this file will
// use it transparently.)
const STORE_NAME = "module-uploads";
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

function tryGetStore(): Store | null {
  try {
    return getStore(STORE_NAME);
  } catch {
    return null;
  }
}

function localFilePath(key: string): string {
  // Keys are always our own generated UUID-prefixed filenames (see
  // modules.ts), never user-controlled paths, so this is safe from
  // directory traversal.
  return path.join(UPLOAD_DIR, key);
}

export async function saveFile(key: string, contents: Buffer): Promise<void> {
  const store = tryGetStore();
  if (store) {
    // @netlify/blobs accepts string | ArrayBuffer | Blob — not a Node
    // Buffer directly — so wrap it.
    await store.set(key, new Blob([new Uint8Array(contents)]));
    return;
  }
  // Keys can contain "/" (e.g. "certificates/SA-XXXX.pdf", "scorm/<id>/...",
  // "og-images/..."), which map to nested subdirectories on local disk —
  // Blobs handles that transparently, so the local-disk fallback needs to
  // create the full parent directory itself, not just UPLOAD_DIR.
  const fullPath = localFilePath(key);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, contents);
}

export async function readFile(key: string): Promise<Buffer | null> {
  const store = tryGetStore();
  if (store) {
    const data = await store.get(key, { type: "arrayBuffer" });
    return data ? Buffer.from(data) : null;
  }
  const fullPath = localFilePath(key);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

export async function deleteFile(key: string): Promise<void> {
  const store = tryGetStore();
  if (store) {
    await store.delete(key);
    return;
  }
  const fullPath = localFilePath(key);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

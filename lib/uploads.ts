import { saveFile } from "@/lib/storage";
import { LIMITS, ActivityInputError } from "@/lib/activities";
import { DOCUMENT_EXTENSIONS, DOCUMENT_ACCEPT } from "@/lib/uploads-shared";

export interface StoredUpload {
  file_path: string;
  file_name: string;
  file_mime: string;
  file_size: number;
}

// Document types accepted for folders and assignment hand-ins. Everything is
// downloaded as an attachment (never rendered in the page), but an allow-list
// still keeps executables and scripts out.
export { DOCUMENT_EXTENSIONS, DOCUMENT_ACCEPT };

export function isRealFile(v: FormDataEntryValue | null): v is File {
  return !!v && typeof v !== "string" && v.size > 0;
}

export function extensionOf(name: string): string {
  return (name.toLowerCase().split(".").pop() || "").replace(/[^a-z0-9]/g, "");
}

export function assertDocument(file: File) {
  if (!DOCUMENT_EXTENSIONS.includes(extensionOf(file.name))) {
    throw new ActivityInputError(`“${file.name}” isn't an allowed file type. Allowed: ${DOCUMENT_EXTENSIONS.join(", ")}.`);
  }
}

export function assertTotalSize(files: File[]) {
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > LIMITS.uploadTotalBytes) {
    throw new ActivityInputError(`That's too much to upload at once (${(total / 1048576).toFixed(1)}MB). The limit is ${LIMITS.uploadTotalBytes / 1048576}MB per save — add the rest in a second save.`);
  }
}

export async function storeUpload(file: File, mimeOverride?: string): Promise<StoredUpload> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const stored = `${crypto.randomUUID()}-${safeName}`;
  await saveFile(stored, Buffer.from(await file.arrayBuffer()));
  return { file_path: stored, file_name: file.name.slice(0, 200), file_mime: mimeOverride || file.type || "application/octet-stream", file_size: file.size };
}

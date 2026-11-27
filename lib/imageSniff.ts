// Identifies an uploaded image from its first bytes — never trusting the
// browser-supplied type or file name — and returns the extension to store it
// with (or null if it isn't one of the formats we accept).
export type ImageExt = "png" | "jpg" | "gif" | "webp" | "svg";

export function sniffImageExtension(buf: Buffer): ImageExt | null {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 6 && buf.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  const head = buf.subarray(0, 1024).toString("utf8").trimStart().toLowerCase();
  if ((head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!doctype svg")) && buf.toString("utf8").toLowerCase().includes("<svg")) return "svg";
  return null;
}

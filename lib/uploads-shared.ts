// Constants that client components need. (lib/uploads.ts also imports server-only storage code.)
export const DOCUMENT_EXTENSIONS = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "csv", "rtf", "odt", "ods", "odp", "png", "jpg", "jpeg", "gif", "webp", "zip", "mp3", "mp4", "wav"];
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.map((e) => "." + e).join(",");

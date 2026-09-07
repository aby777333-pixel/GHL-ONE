import { createElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  Archive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, File as FileIcon, Presentation, FileCode, type LucideIcon,
} from "lucide-react";

export type SB = SupabaseClient<Database>;

/* ------------------------------------------------------------ folders */
export const FOLDERS = [
  "General", "Briefs", "Design", "Development", "Marketing", "Legal", "Finance", "Final Deliverables", "Archive",
  "Brand assets", "Policies", "SOPs", "Presentations", "Contracts", "Reports", "Templates",
] as const;

export function folderSlug(folder: string) {
  return folder.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "general";
}

/** Sanitise a filename for a storage key (keeps extension). */
export function safeFileName(name: string) {
  return name.replace(/[^\w.\-()+ ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 140) || "file";
}

/**
 * Normalised logical name used to detect "Final_FINAL_v2 (copy)" duplicates:
 * strip extension, lowercase, remove final/copy/version markers, digits and punctuation.
 */
export function normalizeName(name: string) {
  return name
    .replace(/\.[a-z0-9]{1,6}$/i, "")
    .toLowerCase()
    .replace(/\b(final|finalised|finalized|latest|new|copy|draft|rev(ision)?|version|v\d+|r\d+)\b/g, " ")
    .replace(/\(\s*\d*\s*\)/g, " ")
    .replace(/[\d]+/g, " ")
    .replace(/[^a-z]+/g, "")
    .trim();
}

/* --------------------------------------------------------- mime groups */
export type MimeGroup = "image" | "pdf" | "doc" | "sheet" | "slides" | "video" | "audio" | "archive" | "text" | "code" | "other";

export const MIME_GROUPS: MimeGroup[] = ["image", "pdf", "doc", "sheet", "slides", "video", "audio", "archive", "text", "code", "other"];
export const MIME_GROUP_LABEL: Record<MimeGroup, string> = {
  image: "Images", pdf: "PDFs", doc: "Documents", sheet: "Spreadsheets", slides: "Presentations", video: "Video",
  audio: "Audio", archive: "Archives", text: "Text", code: "Code", other: "Other",
};

export function extOf(name?: string | null) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

export function mimeGroup(mime?: string | null, name?: string | null): MimeGroup {
  const m = (mime || "").toLowerCase();
  const ext = extOf(name);
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "heic", "bmp"].includes(ext)) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("video/") || ["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (m.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "aac", "flac"].includes(ext)) return "audio";
  if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv" || ["xls", "xlsx", "csv", "numbers", "ods"].includes(ext)) return "sheet";
  if (m.includes("presentation") || m.includes("powerpoint") || ["ppt", "pptx", "key", "odp"].includes(ext)) return "slides";
  if (m.includes("word") || m.includes("opendocument.text") || m === "application/rtf" || ["doc", "docx", "rtf", "odt", "pages"].includes(ext)) return "doc";
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar") || ["zip", "rar", "7z", "gz", "tgz", "tar"].includes(ext)) return "archive";
  if (["js", "ts", "tsx", "jsx", "py", "sql", "json", "html", "css", "sh", "yml", "yaml", "xml"].includes(ext) || m === "application/json") return "code";
  if (m.startsWith("text/") || ["txt", "md", "log"].includes(ext)) return "text";
  return "other";
}

export function fileIcon(group: MimeGroup): LucideIcon {
  switch (group) {
    case "image": return FileImage;
    case "pdf": return FileText;
    case "doc": return FileText;
    case "sheet": return FileSpreadsheet;
    case "slides": return Presentation;
    case "video": return FileVideo;
    case "audio": return FileAudio;
    case "archive": return Archive;
    case "code": return FileCode;
    case "text": return FileText;
    default: return FileIcon;
  }
}

/** Tone class for a mime group — used on icons/thumbnails. */
export function groupTone(group: MimeGroup) {
  switch (group) {
    case "image": return "tone-violet";
    case "pdf": return "tone-danger";
    case "doc": return "tone-info";
    case "sheet": return "tone-success";
    case "slides": return "tone-orange";
    case "video": return "tone-warn";
    case "audio": return "tone-warn";
    case "archive": return "tone-muted";
    case "code": return "tone-neutral";
    default: return "tone-neutral";
  }
}

/* ----------------------------------------------------------- signed URLs */
const urlCache = new Map<string, { url: string; expires: number }>();

/** Signed URL for a private object with an in-memory cache (refreshes ~1 min before expiry). */
export async function signedUrl(supabase: SB, bucket: string, path: string, ttlSeconds = 3600): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const hit = urlCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  urlCache.set(key, { url: data.signedUrl, expires: Date.now() + (ttlSeconds - 60) * 1000 });
  return data.signedUrl;
}

export function publicUrl(supabase: SB, bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/* ---------------------------------------------------------------- upload */
/**
 * Upload a File. Supabase Storage validates the Blob's own `.type`, so the File is re-wrapped
 * with an explicit type and `contentType` is passed too.
 */
export async function uploadFile(supabase: SB, { bucket, path, file, upsert = false }: { bucket: string; path: string; file: File; upsert?: boolean }) {
  const type = file.type || guessMime(file.name);
  const body = file.type === type ? file : new File([file], file.name, { type });
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: type, upsert, cacheControl: "3600" });
  return { error: error ? error.message : null, contentType: type };
}

export function guessMime(name: string) {
  const ext = extOf(name);
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
    pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
    csv: "text/csv", txt: "text/plain", md: "text/markdown", json: "application/json", zip: "application/zip",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return map[ext] || "application/octet-stream";
}

/** Build the canonical storage key for a file version. */
export function storageKey(orgId: string, folder: string, fileName: string) {
  return `${orgId}/${folderSlug(folder)}/${Date.now()}-${safeFileName(fileName)}`;
}

/** Icon element for a mime group (avoids constructing component types during render). */
export function FileTypeIcon({ group, size = 16, className }: { group: MimeGroup; size?: number; className?: string }) {
  return createElement(fileIcon(group), { size, className });
}

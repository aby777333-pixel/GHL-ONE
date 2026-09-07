import type { Tables } from "@/lib/utils";

export type FileVersionRow = Tables<"file_versions">;

export type FilePerson = { id: string; full_name: string; avatar_url: string | null };

export type FileListItem = Tables<"files"> & {
  owner: FilePerson | null;
  project: { id: string; name: string } | null;
  department: { id: string; name: string; color: string } | null;
  versions: Pick<FileVersionRow, "id" | "version" | "storage_path" | "size_bytes" | "mime_type" | "approval_status" | "uploaded_by" | "created_at" | "note">[];
};

export type FileDetailItem = Tables<"files"> & {
  owner: FilePerson | null;
  project: { id: string; name: string } | null;
  department: { id: string; name: string; color: string } | null;
  task: { id: string; title: string } | null;
  versions: (FileVersionRow & { uploader: FilePerson | null })[];
};

export const FILE_SELECT =
  "*, owner:profiles!files_owner_id_fkey(id,full_name,avatar_url), project:projects!files_project_id_fkey(id,name), department:departments!files_department_id_fkey(id,name,color), versions:file_versions(id,version,storage_path,size_bytes,mime_type,approval_status,uploaded_by,created_at,note)";

export const FILE_DETAIL_SELECT =
  "*, owner:profiles!files_owner_id_fkey(id,full_name,avatar_url), project:projects!files_project_id_fkey(id,name), department:departments!files_department_id_fkey(id,name,color), task:tasks!files_task_id_fkey(id,title), versions:file_versions(*, uploader:profiles!file_versions_uploaded_by_fkey(id,full_name,avatar_url))";

export function currentVersion<T extends { version: number }>(file: { current_version: number; versions: T[] }): T | undefined {
  return file.versions.find((v) => v.version === file.current_version) || [...file.versions].sort((a, b) => b.version - a.version)[0];
}

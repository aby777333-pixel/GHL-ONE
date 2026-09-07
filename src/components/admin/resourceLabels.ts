import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type ResourceRef = { resource_type: string; resource_id: string | null };

/** Resolve human labels for project / file / channel / department ids (RLS-scoped; unknown → null). Key: `${type}:${id}`. */
export async function resolveResourceLabels(sb: SupabaseClient<Database>, refs: ResourceRef[]): Promise<Record<string, string>> {
  const by: Record<string, Set<string>> = {};
  for (const r of refs) {
    if (!r.resource_id) continue;
    (by[r.resource_type] ||= new Set()).add(r.resource_id);
  }
  const out: Record<string, string> = {};
  const jobs: PromiseLike<void>[] = [];
  if (by.project) jobs.push(sb.from("projects").select("id,name").in("id", [...by.project]).then(({ data }) => { for (const p of data || []) out[`project:${p.id}`] = p.name; }));
  if (by.file) jobs.push(sb.from("files").select("id,name").in("id", [...by.file]).then(({ data }) => { for (const f of data || []) out[`file:${f.id}`] = f.name; }));
  if (by.channel) jobs.push(sb.from("channels").select("id,name").in("id", [...by.channel]).then(({ data }) => { for (const c of data || []) out[`channel:${c.id}`] = `#${c.name}`; }));
  if (by.department) jobs.push(sb.from("departments").select("id,name").in("id", [...by.department]).then(({ data }) => { for (const d of data || []) out[`department:${d.id}`] = d.name; }));
  if (by.task) jobs.push(sb.from("tasks").select("id,title").in("id", [...by.task]).then(({ data }) => { for (const t of data || []) out[`task:${t.id}`] = t.title; }));
  await Promise.all(jobs);
  return out;
}

export function resourceHref(type: string, id: string | null) {
  if (!id) return null;
  switch (type) {
    case "project": return `/projects/${id}`;
    case "file": return `/files/${id}`;
    case "channel": return `/chat/${id}`;
    case "task": return `/tasks/${id}`;
    default: return null;
  }
}

import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isManagerPlus } from "@/lib/utils";
import { FileDetail, type FileAudit } from "@/components/files/FileDetail";
import { FILE_DETAIL_SELECT, type FileDetailItem } from "@/components/files/types";

export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from("files").select(FILE_DETAIL_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const file = data as unknown as FileDetailItem;
  file.versions.sort((a, b) => b.version - a.version);

  let audit: FileAudit[] = [];
  if (isManagerPlus(session.profile.role)) {
    const { data: logs } = await supabase
      .from("audit_logs")
      .select("id,action,summary,created_at,actor:profiles!audit_logs_actor_id_fkey(id,full_name,avatar_url),new_value")
      .eq("entity_type", "file")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    audit = (logs || []) as unknown as FileAudit[];
  }

  return <FileDetail file={file} audit={audit} />;
}

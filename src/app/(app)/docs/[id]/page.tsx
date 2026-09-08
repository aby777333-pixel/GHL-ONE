import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { LiveDocEditor, type DocComment } from "@/components/docs";
import type { LiveDoc } from "@/lib/live/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Document" };
  const supabase = await createClient();
  const { data } = await supabase.from("live_docs").select("title").eq("id", id).maybeSingle();
  return { title: data ? `${data.title} · Live doc` : "Document" };
}

export default async function LiveDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  await getSession();
  const supabase = await createClient();

  const { data: doc } = await supabase.from("live_docs").select("*").eq("id", id).maybeSingle();
  if (!doc) notFound();

  const { data: comments } = await supabase.from("live_doc_comments").select("*").eq("doc_id", id).order("created_at", { ascending: true }).limit(300);

  return <LiveDocEditor doc={doc as unknown as LiveDoc} initialComments={(comments || []) as unknown as DocComment[]} />;
}

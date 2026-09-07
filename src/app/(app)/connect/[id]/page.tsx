import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { connectPerms } from "@/lib/connectPerms";
import { ConnectWorkspace } from "@/components/connect/ConnectWorkspace";
import { ConnectGate } from "@/components/connect/ConnectGate";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "GHL Connect" };
  const supabase = await createClient();
  const { data } = await supabase.from("conversations").select("subject,channel").eq("id", id).maybeSingle();
  return { title: data ? `${data.subject || data.channel} · Connect` : "GHL Connect" };
}

/** Deep link to one conversation — renders the full workspace with it selected (mobile shows the thread first). */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [, perms] = await Promise.all([getSession(), connectPerms()]);
  if (!perms.use) return <ConnectGate />;
  return <ConnectWorkspace initialId={id} canManage={perms.manage} canApprove={perms.approve} />;
}

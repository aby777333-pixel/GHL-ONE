import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { connectPerms } from "@/lib/connectPerms";
import { ContactPage } from "@/components/connect/ContactPage";
import { ConnectGate } from "@/components/connect/ConnectGate";
import { RestrictedResource } from "@/components/access/RequestAccess";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Contact" };
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("name").eq("id", id).maybeSingle();
  return { title: data ? `${data.name} · Connect` : "Contact" };
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [, perms] = await Promise.all([getSession(), connectPerms()]);
  if (!perms.use) return <ConnectGate />;
  const supabase = await createClient();
  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!contact) return <RestrictedResource kind="contact" backHref="/connect/contacts" backLabel="Contacts" resource_type="dataset" resource_id={id} resource_label="Contact record" />;
  const [{ data: conversations }, { data: inboxes }] = await Promise.all([
    supabase.from("conversations").select("*").eq("contact_id", id).order("last_message_at", { ascending: false }).limit(100),
    supabase.from("inboxes").select("id,name,kind,address").eq("active", true).order("name"),
  ]);
  return <ContactPage contact={contact} conversations={conversations || []} inboxes={inboxes || []} />;
}

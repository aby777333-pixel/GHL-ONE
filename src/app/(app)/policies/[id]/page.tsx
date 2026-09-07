import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PolicyView, type PolicyViewData } from "@/components/policies/PolicyView";

export const metadata = { title: "Policy" };

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const supabase = await createClient();
  const { data: policy } = await supabase.from("policies").select("*").eq("id", id).maybeSingle();
  if (!policy) notFound();
  const [{ data: ack }, { data: versions }] = await Promise.all([
    supabase.from("policy_acks").select("*").eq("policy_id", id).eq("user_id", session.userId).eq("version", policy.version).maybeSingle(),
    supabase.from("policy_versions").select("version,effective_on,published_at,change_note").eq("policy_id", id).order("version", { ascending: false }),
  ]);
  const data: PolicyViewData = { policy, ack: ack || null, versions: versions || [] };
  return <PolicyView data={data} />;
}

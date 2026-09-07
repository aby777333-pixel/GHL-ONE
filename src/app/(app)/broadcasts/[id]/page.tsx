import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isManagerPlus } from "@/lib/utils";
import { BroadcastView } from "@/components/broadcasts/BroadcastView";

export const metadata = { title: "Broadcast" };

type Audience = { all?: boolean; department_ids?: string[]; team_ids?: string[]; roles?: string[]; user_ids?: string[] };

export default async function BroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { profile }] = await Promise.all([params, getSession()]);
  const supabase = await createClient();
  const { data: b } = await supabase.from("broadcasts").select("*").eq("id", id).maybeSingle();
  if (!b) notFound();

  const a = (b.audience && typeof b.audience === "object" && !Array.isArray(b.audience) ? b.audience : {}) as Audience;
  let q = supabase.from("profiles").select("id").eq("is_active", true);
  if (!a.all) {
    const ors: string[] = [];
    if (a.department_ids?.length) ors.push(`department_id.in.(${a.department_ids.join(",")})`);
    if (a.team_ids?.length) ors.push(`team_id.in.(${a.team_ids.join(",")})`);
    if (a.roles?.length) ors.push(`role.in.(${a.roles.join(",")})`);
    if (a.user_ids?.length) ors.push(`id.in.(${a.user_ids.join(",")})`);
    q = ors.length ? q.or(ors.join(",")) : q.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const [{ data: audience }, { data: acks }, { data: checkins }, { data: commPerm }] = await Promise.all([
    q.limit(2000),
    supabase.from("broadcast_acks").select("user_id,acked_at").eq("broadcast_id", id),
    supabase.from("checkins").select("user_id,status,note,at").eq("broadcast_id", id),
    supabase.rpc("has_admin_perm", { perm: "communication.manage" }),
  ]);
  const canSeeRollup = b.created_by === profile.id || isManagerPlus(profile.role) || !!commPerm;
  return <BroadcastView b={b} acks={acks || []} checkins={checkins || []} audienceIds={(audience || []).map((p) => p.id)} canSeeRollup={canSeeRollup} />;
}

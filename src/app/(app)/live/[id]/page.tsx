import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { LiveRoom } from "@/components/live/LiveRoom";
import type { LiveRoom as LiveRoomRow } from "@/lib/live/types";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("live_rooms").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ? `${data.title} · Live` : "Live room" };
}

export default async function LiveRoomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const [{ id }, sp, session] = await Promise.all([params, searchParams, getSession()]);
  const supabase = await createClient();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  // RLS decides visibility, so a missing row can mean "gone" or "not yours". Rather than a raw
  // error, LiveRoom asks /api/live/token, which tells the two apart and renders the friendly
  // state — ended, waiting for the host, or Request access.
  const { data: room } = await supabase.from("live_rooms").select("*").eq("id", id).maybeSingle();

  return (
    <LiveRoom
      roomId={id}
      initialRoom={(room as unknown as LiveRoomRow) ?? null}
      inviteId={one(sp.invite) || null}
      me={{ id: session.userId, name: session.profile.full_name || session.email, orgId: session.profile.org_id || "" }}
    />
  );
}

import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { MeetingsClient, type MeetingListItem } from "@/components/meetings/MeetingsClient";

export const metadata = { title: "Meetings" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const since = new Date(new Date().getTime() - 90 * 86400_000).toISOString();
  const [{ data: meetings }, { data: projects }] = await Promise.all([
    supabase.from("meetings").select("*").gte("starts_at", since).order("starts_at", { ascending: false }).limit(300),
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
  ]);
  const ids = (meetings || []).map((m) => m.id);
  const [{ data: parts }, { data: actions }] = ids.length
    ? await Promise.all([
        supabase.from("meeting_participants").select("meeting_id,user_id").in("meeting_id", ids),
        supabase.from("meeting_actions").select("meeting_id,confirmed").in("meeting_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const items: MeetingListItem[] = (meetings || []).map((m) => ({
    ...m,
    participant_ids: (parts || []).filter((p) => p.meeting_id === m.id).map((p) => p.user_id),
    action_count: (actions || []).filter((a) => a.meeting_id === m.id).length,
    confirmed_count: (actions || []).filter((a) => a.meeting_id === m.id && a.confirmed).length,
  }));

  return (
    <MeetingsClient
      meetings={items}
      projects={projects || []}
      openNew={one(sp.new) === "1"}
      initialTab={one(sp.tab) || undefined}
      defaults={{
        project_id: one(sp.project) || null,
        title: one(sp.title) || undefined,
        participants: one(sp.with).split(",").map((s) => s.trim()).filter(Boolean),
      }}
    />
  );
}

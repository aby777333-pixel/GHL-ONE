import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ApprovalsClient } from "@/components/approvals/ApprovalsClient";
import { APPROVAL_TYPES, type ApprovalType } from "@/lib/utils";

export const metadata = { title: "Approvals" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: approvals }, { data: projects }] = await Promise.all([
    supabase.from("approvals").select("*").order("created_at", { ascending: false }).limit(400),
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
  ]);
  const type = one(sp.type);
  return (
    <ApprovalsClient
      approvals={approvals || []}
      projects={projects || []}
      initialTab={one(sp.tab) || undefined}
      openNew={one(sp.new) === "1"}
      defaults={{
        title: one(sp.title) || undefined,
        project_id: one(sp.project) || null,
        task_id: one(sp.task) || null,
        file_id: one(sp.file) || null,
        type: APPROVAL_TYPES.includes(type as ApprovalType) ? (type as ApprovalType) : undefined,
      }}
    />
  );
}

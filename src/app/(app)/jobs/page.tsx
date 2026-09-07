import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { JobBoard, type JobBoardData } from "@/components/jobs/JobBoard";

export const metadata = { title: "Internal jobs" };

export default async function JobsPage() {
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: jobs }, { data: applications }, { data: isHr }] = await Promise.all([
    // RLS: open postings for everyone; closed ones for HR, the hiring manager and the creator.
    supabase.from("job_openings").select("*").eq("internal", true).order("status").order("created_at", { ascending: false }),
    // RLS: my own applications, plus every application on jobs I hire for (or all, for HR).
    supabase.from("internal_applications").select("*").order("created_at", { ascending: false }),
    supabase.rpc("is_hr"),
  ]);
  const data: JobBoardData = { jobs: jobs || [], applications: applications || [], isHr: !!isHr, userId: session.userId };
  return <JobBoard data={data} />;
}

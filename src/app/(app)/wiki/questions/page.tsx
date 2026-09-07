import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { QuestionsList, type QuestionRow } from "@/components/questions/QuestionsList";

export const metadata = { title: "Questions & answers" };

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, sp] = await Promise.all([getSession(), searchParams]);
  const supabase = await createClient();
  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase.from("questions").select("*").order("created_at", { ascending: false }).limit(400),
    supabase.from("answers").select("question_id,votes").limit(4000),
  ]);
  const rows: QuestionRow[] = (questions || []).map((q) => {
    const mine = (answers || []).filter((a) => a.question_id === q.id);
    return { ...q, answer_count: mine.length, top_votes: mine.reduce((m, a) => Math.max(m, a.votes), 0) };
  });
  return <QuestionsList rows={rows} initialAsk={sp.new === "1"} />;
}

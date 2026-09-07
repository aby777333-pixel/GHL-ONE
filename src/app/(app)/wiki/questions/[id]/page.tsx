import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { QuestionView, type AnswerRow } from "@/components/questions/QuestionView";

export const metadata = { title: "Question" };

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { userId }] = await Promise.all([params, getSession()]);
  const supabase = await createClient();
  const { data: q } = await supabase.from("questions").select("*").eq("id", id).maybeSingle();
  if (!q) notFound();
  const [{ data: answers }, { data: votes }] = await Promise.all([
    supabase.from("answers").select("*").eq("question_id", id).order("created_at"),
    supabase.from("answer_votes").select("answer_id").eq("user_id", userId),
  ]);
  const mine = new Set((votes || []).map((v) => v.answer_id));
  const rows: AnswerRow[] = (answers || []).map((a) => ({ ...a, my_vote: mine.has(a.id) }));
  return <QuestionView q={q} answers={rows} />;
}

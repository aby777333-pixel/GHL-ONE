"use client";

import * as React from "react";
import Link from "next/link";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, EmptyState, Pill, Progress, Skeleton } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { cn, relDate } from "@/lib/utils";
import { LEVEL_LABEL, LEVEL_TONE, goalProgress, progressTone, type Goal, type GoalTaskLink } from "./lib";

type Loaded = { goals: Goal[]; links: GoalTaskLink[] };

/** Load goals visible to the caller with their linked tasks. */
export async function loadGoals(ownerIds?: string[]): Promise<Loaded> {
  const supabase = createClient();
  let q = supabase.from("goals").select("*").eq("status", "active").order("due_on", { ascending: true, nullsFirst: false }).limit(12);
  if (ownerIds && ownerIds.length) q = q.in("owner_id", ownerIds);
  const { data: goals } = await q;
  const ids = (goals || []).map((g) => g.id);
  const { data: links } = ids.length ? await supabase.from("goal_tasks").select("goal_id,task_id,task:tasks!goal_tasks_task_id_fkey(id,title,status,assignee_id,due_date)").in("goal_id", ids) : { data: [] };
  return { goals: goals || [], links: ((links || []) as unknown as GoalTaskLink[]).map((l) => ({ goal_id: l.goal_id, task_id: l.task_id, task: l.task || null })) };
}

export function GoalRows({ goals, links, showOwner, showLevel }: { goals: Goal[]; links: GoalTaskLink[]; showOwner?: boolean; showLevel?: boolean }) {
  return (
    <ul className="px-[var(--s3)] pb-[var(--s3)] space-y-0.5">
      {goals.map((g) => {
        const pct = goalProgress(g, links.filter((l) => l.goal_id === g.id));
        const overdue = !!g.due_on && new Date(g.due_on) < new Date() && pct < 100;
        return (
          <li key={g.id}>
            <Link href={`/goals?goal=${g.id}`} className="block px-2 py-1.5 rounded-[var(--radius-sm)] row-hover">
              <div className="flex items-center gap-2 min-w-0">
                {showLevel && <Pill tone={LEVEL_TONE[g.level]}>{LEVEL_LABEL[g.level]}</Pill>}
                <span className="text-sm truncate flex-1">{g.title}</span>
                {g.due_on && <span className={cn("text-[11px] num shrink-0", overdue ? "text-danger" : "text-muted")}>{relDate(g.due_on)}</span>}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {showOwner && <PersonChip id={g.owner_id} size={14} showName={false} />}
                <Progress value={pct} height={4} tone={progressTone(pct, g)} />
                <span className="text-[11px] num text-muted w-8 text-right">{pct}%</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Goals owned by one person (profile card). */
export function PersonGoals({ userId, self }: { userId: string; self: boolean }) {
  const [data, setData] = React.useState<Loaded | null>(null);
  React.useEffect(() => {
    let alive = true;
    loadGoals([userId]).then((d) => alive && setData(d));
    return () => { alive = false; };
  }, [userId]);
  if (!data) return <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5 w-2/3" /></div>;
  if (data.goals.length === 0) return <div className="px-[var(--s4)] pb-[var(--s4)] text-sm text-muted">No active goals{self ? <> — <Link href="/goals?new=1" className="link">set one</Link> for this quarter.</> : "."}</div>;
  return <GoalRows goals={data.goals} links={data.links} />;
}

/** Home (manager view): the team's active goals. */
export function TeamGoalsCard() {
  const { profile, people } = useSession();
  const [data, setData] = React.useState<Loaded | null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const deptPeople = people.filter((p) => p.department_id && p.department_id === profile.department_id).map((p) => p.id);
      let q = supabase.from("goals").select("*").eq("status", "active").order("due_on", { ascending: true, nullsFirst: false }).limit(8);
      if (profile.department_id) q = q.or(`department_id.eq.${profile.department_id},owner_id.in.(${[...new Set([profile.id, ...deptPeople])].join(",")})`);
      else q = q.neq("level", "company");
      const { data: goals } = await q;
      const ids = (goals || []).map((g) => g.id);
      const { data: links } = ids.length ? await supabase.from("goal_tasks").select("goal_id,task_id,task:tasks!goal_tasks_task_id_fkey(id,title,status,assignee_id,due_date)").in("goal_id", ids) : { data: [] };
      if (alive) setData({ goals: goals || [], links: ((links || []) as unknown as GoalTaskLink[]).map((l) => ({ goal_id: l.goal_id, task_id: l.task_id, task: l.task || null })) });
    })();
    return () => { alive = false; };
  }, [profile.id, profile.department_id, people]);

  return (
    <Card>
      <CardHeader title="Team goals" subtitle="What your department is driving this period" action={<Link href="/goals?scope=team" className="text-xs text-muted hover:text-[var(--fg)]">All goals →</Link>} />
      {!data ? (
        <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5 w-3/4" /></div>
      ) : data.goals.length === 0 ? (
        <EmptyState icon={<Target size={16} />} title="No team goals yet" hint="Set a department goal and link the work that moves it." className="py-6" action={<Link href="/goals?new=1" className="btn btn-secondary btn-sm">Set a goal</Link>} />
      ) : (
        <GoalRows goals={data.goals} links={data.links} showOwner showLevel />
      )}
    </Card>
  );
}

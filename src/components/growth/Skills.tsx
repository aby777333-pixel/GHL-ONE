"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Search, ShieldCheck, Users, X, ArrowLeft, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Card, CardHeader, EmptyState, PageHeader, Pill, SearchInput, Skeleton, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ChatButton } from "@/components/people/PeopleBits";
import { PRESENCE_LABEL, PRESENCE_TONE } from "@/components/people/types";
import { cn, type Profile } from "@/lib/utils";
import { skillKey } from "./lib";

type Person = Pick<Profile, "id" | "full_name" | "avatar_url" | "designation" | "department_id" | "presence" | "skills">;
type EndorsementLite = { user_id: string; skill: string; verified: boolean; endorsed_by: string };
export type SkillsData = { people: Person[]; endorsements: EndorsementLite[]; initialSkill: string; initialQuery: string };

type Expert = { id: string; full_name: string; designation: string | null; department_id: string | null; department_name: string | null; presence: Profile["presence"]; skills: string[]; open_tasks: number; matched_on: string };
type SkillAgg = { key: string; label: string; people: number; endorsements: number; verified: number };

const MATCH_LABEL: Record<string, string> = { skill: "Listed skill", designation: "Role", responsibilities: "Responsibilities", department: "Department", endorsement: "Endorsed" };

export function Skills({ data }: { data: SkillsData }) {
  const router = useRouter();
  const toast = useToast();
  const { people } = useSession();
  const [q, setQ] = React.useState(data.initialQuery || data.initialSkill);
  const [active, setActive] = React.useState<string | null>(data.initialSkill || data.initialQuery || null);
  const [experts, setExperts] = React.useState<Expert[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  const cloud = React.useMemo<SkillAgg[]>(() => {
    const m = new Map<string, SkillAgg & { casing: Map<string, number> }>();
    const bump = (raw: string, kind: "person" | "endorsement" | "verified") => {
      const key = skillKey(raw);
      if (!key) return;
      let a = m.get(key);
      if (!a) { a = { key, label: raw.trim(), people: 0, endorsements: 0, verified: 0, casing: new Map() }; m.set(key, a); }
      a.casing.set(raw.trim(), (a.casing.get(raw.trim()) || 0) + 1);
      if (kind === "person") a.people += 1;
      if (kind === "endorsement") a.endorsements += 1;
      if (kind === "verified") a.verified += 1;
    };
    for (const p of data.people) for (const s of p.skills || []) bump(s, "person");
    for (const e of data.endorsements) { bump(e.skill, "endorsement"); if (e.verified) bump(e.skill, "verified"); }
    return [...m.values()]
      .map((a) => ({ key: a.key, label: [...a.casing.entries()].sort((x, y) => y[1] - x[1])[0][0], people: a.people, endorsements: a.endorsements, verified: a.verified }))
      .sort((a, b) => b.people + b.endorsements - (a.people + a.endorsements) || a.label.localeCompare(b.label));
  }, [data.people, data.endorsements]);

  const maxWeight = cloud[0] ? cloud[0].people + cloud[0].endorsements : 1;
  const shownCloud = React.useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? cloud.filter((s) => s.label.toLowerCase().includes(needle)) : cloud;
  }, [cloud, filter]);

  const search = React.useCallback(async (term: string) => {
    const t = term.trim();
    if (!t) { setExperts(null); setActive(null); return; }
    setLoading(true);
    setActive(t);
    const { data: rows, error } = await createClient().rpc("find_experts", { p_q: t, p_limit: 24 });
    setLoading(false);
    if (error) { toast.push(error.message, "danger"); setExperts([]); return; }
    setExperts((rows || []) as Expert[]);
  }, [toast]);

  // Initial deep link (?skill= or ?q=) — async load, no sync setState in the effect body.
  React.useEffect(() => {
    const initial = data.initialSkill || data.initialQuery;
    if (!initial) return;
    const t = setTimeout(() => void search(initial), 0);
    return () => clearTimeout(t);
  }, [data.initialSkill, data.initialQuery, search]);

  // Debounced search-as-you-type.
  React.useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const t = setTimeout(() => { if (term !== active) void search(term); }, 380);
    return () => clearTimeout(t);
  }, [q, active, search]);

  function pick(label: string) {
    setQ(label);
    void search(label);
    router.replace(`/people/skills?skill=${encodeURIComponent(label)}`, { scroll: false });
  }
  function clear() {
    setQ("");
    setExperts(null);
    setActive(null);
    router.replace("/people/skills", { scroll: false });
  }

  const activeAgg = active ? cloud.find((s) => s.key === skillKey(active)) : undefined;
  const endorsedFor = React.useMemo(() => {
    if (!active) return new Map<string, { count: number; verified: number }>();
    const key = skillKey(active);
    const m = new Map<string, { count: number; verified: number }>();
    for (const e of data.endorsements) if (skillKey(e.skill) === key) {
      const cur = m.get(e.user_id) || { count: 0, verified: 0 };
      cur.count += 1;
      if (e.verified) cur.verified += 1;
      m.set(e.user_id, cur);
    }
    return m;
  }, [active, data.endorsements]);

  return (
    <div className="page">
      <Link href="/people" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> People</Link>
      <PageHeader eyebrow="Company" title="Skills & experts" subtitle={`${cloud.length} skill${cloud.length === 1 ? "" : "s"} across ${data.people.length} people. Find who can help — before you ask around.`} />

      {/* Find an expert */}
      <Card className="p-[var(--s4)] mb-[var(--s4)]">
        <div className="flex items-center gap-2 mb-2"><Sparkles size={16} className="text-[var(--brand)]" /><span className="h3">Find an expert</span></div>
        <div className="text-xs text-muted mb-3">Try a skill, a tool, a role or a topic — “Figma”, “GST filing”, “investor decks”, “Tally”. Matches skills, designations, responsibilities, departments and endorsements.</div>
        <div className="flex gap-2">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who knows about…" className="flex-1" onKeyDown={(e) => { if (e.key === "Enter") void search(q); }} />
          {active && <button className="btn btn-secondary" onClick={clear}><X size={14} /> Clear</button>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-[var(--s4)] items-start">
        <div className="min-w-0 space-y-[var(--s4)]">
          {active ? (
            <Card>
              <CardHeader
                title={<span className="inline-flex items-center gap-2"><Search size={14} className="text-muted" /> {active}</span>}
                subtitle={loading ? "Searching…" : experts ? `${experts.length} ${experts.length === 1 ? "person" : "people"}${activeAgg ? ` · ${activeAgg.endorsements} endorsement${activeAgg.endorsements === 1 ? "" : "s"}${activeAgg.verified ? `, ${activeAgg.verified} verified` : ""}` : ""}` : undefined}
              />
              {loading && !experts ? (
                <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
              ) : experts && experts.length === 0 ? (
                <EmptyState icon={<Users size={18} />} title={`Nobody listed for “${active}” yet`} hint="Ask in #help — or add the skill to your own profile if that is you." className="py-[var(--s4)]" />
              ) : (
                <div className="divide-y border-t">
                  {(experts || []).map((x) => {
                    const en = endorsedFor.get(x.id);
                    const busy = x.open_tasks >= 12;
                    return (
                      <div key={x.id} className="flex items-center gap-3 px-[var(--s4)] py-3">
                        <Link href={`/people/${x.id}`} className="shrink-0"><Avatar name={x.full_name} src={people.find((p) => p.id === x.id)?.avatar_url} size={40} presence={x.presence} /></Link>
                        <div className="min-w-0 flex-1">
                          <Link href={`/people/${x.id}`} className="text-sm font-medium truncate hover:underline block">{x.full_name}</Link>
                          <div className="text-xs text-muted truncate">{x.designation || "—"}{x.department_name ? ` · ${x.department_name}` : ""}</div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <Pill tone={PRESENCE_TONE[x.presence] || "tone-muted"}>{PRESENCE_LABEL[x.presence] || x.presence}</Pill>
                            <Pill tone={busy ? "tone-warn" : "tone-neutral"}><Briefcase size={10} /> {x.open_tasks} open task{x.open_tasks === 1 ? "" : "s"}</Pill>
                            <Pill tone="tone-info">{MATCH_LABEL[x.matched_on] || x.matched_on}</Pill>
                            {en && <Pill tone={en.verified ? "tone-success" : "tone-violet"}>{en.verified ? <ShieldCheck size={10} /> : null} {en.count} endorsement{en.count === 1 ? "" : "s"}{en.verified ? " · verified" : ""}</Pill>}
                          </div>
                        </div>
                        <ChatButton userId={x.id} size="sm" className="shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ) : (
            <Card>
              <CardHeader title="Skill cloud" subtitle="Bigger = more people and endorsements. Click a skill to see who has it." action={
                <div className="w-[180px] hidden sm:block"><SearchInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter skills" style={{ height: 30 }} /></div>
              } />
              <div className="px-[var(--s4)] pb-[var(--s4)]">
                <div className="sm:hidden mb-3"><SearchInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter skills" /></div>
                {shownCloud.length === 0 ? (
                  <EmptyState icon={<Sparkles size={18} />} title={cloud.length ? "No skill matches" : "No skills listed yet"} hint={cloud.length ? "Try another word." : "Add skills on your profile so colleagues can find you."} />
                ) : (
                  <div className="flex flex-wrap gap-2 items-center">
                    {shownCloud.map((s) => {
                      const w = (s.people + s.endorsements) / maxWeight;
                      const size = 0.75 + w * 0.6;
                      return (
                        <button key={s.key} onClick={() => pick(s.label)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors hover:border-[var(--brand)] hover:bg-[var(--neutral-bg)]", s.verified > 0 && "border-[var(--success)]")} style={{ fontSize: `${size}rem` }} title={`${s.people} ${s.people === 1 ? "person" : "people"} · ${s.endorsements} endorsement${s.endorsements === 1 ? "" : "s"}${s.verified ? ` · ${s.verified} verified` : ""}`}>
                          <span className="font-medium">{s.label}</span>
                          <span className="text-[11px] text-muted num">{s.people}</span>
                          {s.verified > 0 && <ShieldCheck size={12} className="text-success" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-[var(--s4)] min-w-0">
          <Card>
            <CardHeader title="Most endorsed" subtitle="Skills colleagues vouch for" />
            {cloud.filter((s) => s.endorsements > 0).length === 0 ? (
              <div className="px-[var(--s4)] pb-[var(--s4)] text-sm text-muted">No endorsements yet. Open a colleague&apos;s profile and endorse a skill you have seen them use.</div>
            ) : (
              <ul className="px-[var(--s3)] pb-[var(--s3)]">
                {cloud.filter((s) => s.endorsements > 0).sort((a, b) => b.endorsements - a.endorsements).slice(0, 8).map((s) => (
                  <li key={s.key}>
                    <button onClick={() => pick(s.label)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] row-hover text-left text-sm">
                      <span className="truncate flex-1">{s.label}</span>
                      {s.verified > 0 && <Pill tone="tone-success"><ShieldCheck size={10} /> {s.verified}</Pill>}
                      <span className="text-xs text-muted num">{s.endorsements}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="How endorsements work" />
            <ul className="px-[var(--s4)] pb-[var(--s4)] text-xs text-2 space-y-1.5 list-disc pl-8">
              <li>Anyone can endorse a colleague&apos;s skill (level 1–5, with a note).</li>
              <li>An endorsement from the person&apos;s manager, department head or HR is marked <span className="text-success font-medium">verified</span>.</li>
              <li>You cannot endorse yourself. Add your own skills from your profile.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

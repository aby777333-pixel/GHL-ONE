"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ShieldCheck, ThumbsUp, X, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Input, Modal, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import { skillKey, type EndorsementRow } from "./lib";

type Person = { id: string; full_name: string; skills: string[] };

/** Skills card body for a profile: chips with endorsement counts, Endorse (others) and Add skill (self). */
export function ProfileSkills({ person, self }: { person: Person; self: boolean }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [skills, setSkills] = React.useState<string[]>(person.skills);
  const [rows, setRows] = React.useState<EndorsementRow[] | null>(null);
  const [endorsing, setEndorsing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [newSkill, setNewSkill] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data } = await createClient().from("skill_endorsements").select("*").eq("user_id", person.id).order("created_at", { ascending: false });
    setRows(data || []);
  }, [person.id]);
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const agg = React.useMemo(() => {
    const m = new Map<string, { label: string; count: number; verified: number; mine: boolean; avgLevel: number; by: string[] }>();
    for (const s of skills) m.set(skillKey(s), { label: s, count: 0, verified: 0, mine: false, avgLevel: 0, by: [] });
    for (const e of rows || []) {
      const k = skillKey(e.skill);
      let a = m.get(k);
      if (!a) { a = { label: e.skill, count: 0, verified: 0, mine: false, avgLevel: 0, by: [] }; m.set(k, a); }
      a.count += 1;
      if (e.verified) a.verified += 1;
      if (e.endorsed_by === profile.id) a.mine = true;
      if (e.level) a.avgLevel += e.level;
      a.by.push(e.endorsed_by);
    }
    return [...m.values()].map((a) => ({ ...a, avgLevel: a.count ? Math.round((a.avgLevel / a.count) * 10) / 10 : 0 })).sort((x, y) => y.verified - x.verified || y.count - x.count || x.label.localeCompare(y.label));
  }, [skills, rows, profile.id]);

  async function addSkill(e: React.FormEvent) {
    e.preventDefault();
    const s = newSkill.trim();
    if (!s) return;
    if (skills.some((x) => skillKey(x) === skillKey(s))) { toast.push("Already listed", "info"); setNewSkill(""); return; }
    setBusy(true);
    const next = [...skills, s];
    const { error } = await createClient().from("profiles").update({ skills: next }).eq("id", profile.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setSkills(next);
    setNewSkill("");
    setAdding(false);
    toast.push("Skill added", "success");
    router.refresh();
  }
  async function removeSkill(s: string) {
    const next = skills.filter((x) => x !== s);
    const { error } = await createClient().from("profiles").update({ skills: next }).eq("id", profile.id);
    if (error) { toast.push(error.message, "danger"); return; }
    setSkills(next);
    router.refresh();
  }
  async function retract(skill: string) {
    const { error } = await createClient().from("skill_endorsements").delete().eq("user_id", person.id).eq("endorsed_by", profile.id).eq("skill", skill);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Endorsement removed", "info");
    void load();
  }

  return (
    <div>
      {rows === null ? (
        <div className="space-y-2"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-6 w-1/2" /></div>
      ) : agg.length === 0 ? (
        <div className="text-sm text-muted">No skills listed{self ? " — add some so colleagues can find you." : "."}</div>
      ) : (
        <ul className="space-y-1.5">
          {agg.map((a) => (
            <li key={a.label} className="flex items-center gap-2 min-w-0">
              <Link href={`/people/skills?skill=${encodeURIComponent(a.label)}`} className={cn("pill hover:bg-[var(--line)] min-w-0", a.verified ? "tone-success" : "tone-neutral")} title="See everyone with this skill">
                {a.verified > 0 && <ShieldCheck size={10} />}<span className="truncate">{a.label}</span>
              </Link>
              {a.count > 0 && (
                <span className="text-[11px] text-muted num inline-flex items-center gap-1" title={a.by.map((id) => people.find((p) => p.id === id)?.full_name || "Someone").join(", ")}>
                  <ThumbsUp size={11} /> {a.count}{a.avgLevel ? <span className="inline-flex items-center gap-0.5">· <Star size={10} className="text-warn" /> {a.avgLevel}</span> : null}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1 shrink-0">
                {!self && !a.mine && <button className="text-[11px] link" onClick={() => setEndorsing(a.label)}>Endorse</button>}
                {!self && a.mine && <button className="text-[11px] text-muted hover:text-danger" onClick={() => retract(a.label)} title="Remove my endorsement">Endorsed ✓</button>}
                {self && skills.includes(a.label) && <button className="text-muted hover:text-danger" onClick={() => removeSkill(a.label)} aria-label={`Remove ${a.label}`}><X size={12} /></button>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {self ? (
          adding ? (
            <form onSubmit={addSkill} className="flex items-center gap-2 w-full">
              <Input autoFocus value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="e.g. Figma, GST filing, Tally" className="flex-1" style={{ height: 32 }} />
              <Button type="submit" size="sm" variant="primary" loading={busy}>Add</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </form>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus size={13} /> Add skill</Button>
          )
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setEndorsing("")}><ThumbsUp size={13} /> Endorse a skill</Button>
        )}
        <Link href="/people/skills" className="text-[11px] text-muted hover:underline ml-auto">All skills →</Link>
      </div>

      {endorsing !== null && (
        <EndorseModal person={person} skills={agg.map((a) => a.label)} initialSkill={endorsing} onClose={() => setEndorsing(null)} onDone={() => { setEndorsing(null); void load(); }} />
      )}
    </div>
  );
}

function EndorseModal({ person, skills, initialSkill, onClose, onDone }: { person: Person; skills: string[]; initialSkill: string; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [skill, setSkill] = React.useState(initialSkill || skills[0] || "");
  const [custom, setCustom] = React.useState(initialSkill === "" && skills.length === 0);
  const [level, setLevel] = React.useState(4);
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = skill.trim();
    if (!s) return;
    setLoading(true);
    const { error } = await createClient().from("skill_endorsements").insert({ user_id: person.id, skill: s, endorsed_by: profile.id, level, note: note.trim() || null });
    setLoading(false);
    if (error) { toast.push(error.code === "23505" ? "You already endorsed this skill." : error.message, "danger"); return; }
    toast.push(`Endorsed ${person.full_name.split(" ")[0]} for ${s}`, "success");
    onDone();
  }

  return (
    <Modal open onClose={onClose} title={`Endorse ${person.full_name}`} width={460}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center gap-2.5"><Avatar name={person.full_name} size={32} /><div className="text-sm">Vouch for a skill you have <span className="font-medium">seen them use</span>. Endorsements from managers and HR show as verified.</div></div>
        <Field label="Skill">
          {custom ? (
            <div className="flex gap-2">
              <Input autoFocus value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Type a skill" className="flex-1" />
              {skills.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => { setCustom(false); setSkill(skills[0]); }}>Pick listed</Button>}
            </div>
          ) : (
            <div className="flex gap-2">
              <Select value={skill} onChange={(e) => setSkill(e.target.value)} className="flex-1">
                {skills.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setCustom(true); setSkill(""); }}>Other…</Button>
            </div>
          )}
        </Field>
        <Field label={`Level · ${["", "Beginner", "Working knowledge", "Solid", "Strong", "Expert"][level]}`}>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} onClick={() => setLevel(n)} className={cn("w-9 h-9 rounded-[var(--radius-sm)] border inline-flex items-center justify-center transition-colors", n <= level ? "tone-warn border-transparent" : "hover:bg-[var(--neutral-bg)]")} aria-label={`Level ${n}`}>
                <Star size={16} fill={n <= level ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Note" hint="Optional — where did you see it? A line is enough.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 70 }} placeholder="e.g. Built the whole investor deck for the March round." />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!skill.trim()}><ThumbsUp size={14} /> Endorse</Button>
        </div>
      </form>
    </Modal>
  );
}

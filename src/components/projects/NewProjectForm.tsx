"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Diamond, LayoutTemplate, ListChecks, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Input, Textarea, useToast } from "@/components/ui";
import { PersonPicker, DepartmentPicker, PriorityPicker, ClassificationPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, PRIORITY_LABEL, type Classification, type TaskPriority } from "@/lib/utils";

export type TemplateLite = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  department_slug: string | null;
  tasks: { title: string; priority?: TaskPriority; due_offset_days?: number; depends_on_previous?: boolean }[];
  milestones: { title: string; offset_pct?: number }[];
};

export function NewProjectForm({ templates }: { templates: TemplateLite[] }) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [objectives, setObjectives] = React.useState("");
  const [department, setDepartment] = React.useState(profile.department_id || "");
  const [owner, setOwner] = React.useState(profile.id);
  const [priority, setPriority] = React.useState<TaskPriority>("normal");
  const [classification, setClassification] = React.useState<Classification>("internal");
  const [start, setStart] = React.useState("");
  const [due, setDue] = React.useState("");
  const [client, setClient] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [tplKey, setTplKey] = React.useState("");
  const [members, setMembers] = React.useState<string[]>([]);
  const [memberQ, setMemberQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const tpl = templates.find((t) => t.key === tplKey) || null;
  function chooseTemplate(key: string) {
    setTplKey(key);
    const t = templates.find((x) => x.key === key);
    if (!t) return;
    const d = departments.find((x) => x.slug === t.department_slug);
    if (d && !department) setDepartment(d.id);
    if (!description && t.description) setDescription(t.description);
  }

  const toggleMember = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const visiblePeople = people.filter((p) => p.id !== owner && (!memberQ || p.full_name.toLowerCase().includes(memberQ.toLowerCase())));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const extra = {
      description: description || null,
      objectives: objectives || null,
      priority,
      classification,
      start_date: start || null,
      client_name: client || null,
      tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    };
    let projectId: string | null = null;
    if (tplKey) {
      const { data, error } = await supabase.rpc("create_project_from_template", {
        tpl_key: tplKey,
        p_name: name.trim(),
        p_owner: owner || profile.id,
        p_due: (due || null) as unknown as string,
        p_department: department || undefined,
      });
      if (error || !data) {
        setLoading(false);
        return toast.push(error?.message || "Could not create project", "danger");
      }
      projectId = data;
      const { error: uErr } = await supabase.from("projects").update(extra).eq("id", projectId);
      if (uErr) toast.push(`Project created, but some fields failed: ${uErr.message}`, "danger");
    } else {
      const { data, error } = await supabase
        .from("projects")
        .insert({ org_id: profile.org_id!, name: name.trim(), department_id: department || null, owner_id: owner || profile.id, due_date: due || null, status: "planning", created_by: profile.id, ...extra })
        .select("id")
        .single();
      if (error || !data) {
        setLoading(false);
        return toast.push(error?.message || "Could not create project", "danger");
      }
      projectId = data.id;
    }
    if (members.length) {
      const { error: mErr } = await supabase.from("project_members").upsert(members.map((user_id) => ({ project_id: projectId!, user_id, role: "member" })), { onConflict: "project_id,user_id", ignoreDuplicates: true });
      if (mErr) toast.push(`Members could not be added: ${mErr.message}`, "danger");
    }
    setLoading(false);
    toast.push("Project created", "success");
    router.push(`/projects/${projectId}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-[var(--s4)]">
      {/* Template */}
      <section className="card p-[var(--s4)]">
        <div className="flex items-center gap-2 mb-3"><LayoutTemplate size={15} className="text-muted" /><span className="h3">Template</span><span className="text-xs text-muted">optional</span></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <button type="button" onClick={() => chooseTemplate("")} className={cn("text-left card card-hover p-3 border-2", !tplKey ? "border-[var(--brand-2)]" : "border-transparent")}>
            <div className="flex items-center gap-2 text-sm font-medium"><Sparkles size={14} className="text-muted" /> Blank project</div>
            <div className="text-xs text-muted mt-1">Start empty and add tasks as you go.</div>
          </button>
          {templates.map((t) => (
            <button type="button" key={t.key} onClick={() => chooseTemplate(t.key)} className={cn("text-left card card-hover p-3 border-2", tplKey === t.key ? "border-[var(--brand-2)]" : "border-transparent")}>
              <div className="flex items-center gap-2 text-sm font-medium">{tplKey === t.key ? <Check size={14} className="text-[var(--brand-2)]" /> : <LayoutTemplate size={14} className="text-muted" />} {t.name}</div>
              <div className="text-xs text-muted mt-1 truncate-2">{t.description}</div>
              <div className="text-[11px] text-muted mt-1.5 num">{t.tasks.length} tasks · {t.milestones.length} milestones</div>
            </button>
          ))}
        </div>
        {tpl && (
          <div className="mt-3 grid md:grid-cols-2 gap-3 anim-fade-up">
            <div className="rounded-[var(--radius-sm)] sunken p-3">
              <div className="eyebrow mb-2 flex items-center gap-1.5"><ListChecks size={12} /> Tasks that will be created</div>
              <ol className="space-y-1">
                {tpl.tasks.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-right text-muted num">{i + 1}.</span>
                    <span className="truncate flex-1">{t.title}</span>
                    {t.depends_on_previous && <span className="text-[10px] text-muted">after {i}</span>}
                    {t.priority && t.priority !== "normal" && <span className="pill tone-neutral">{PRIORITY_LABEL[t.priority]}</span>}
                    {typeof t.due_offset_days === "number" && <span className="text-[10px] text-muted num">+{t.due_offset_days}d</span>}
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-[var(--radius-sm)] sunken p-3">
              <div className="eyebrow mb-2 flex items-center gap-1.5"><Diamond size={12} /> Milestones</div>
              <ul className="space-y-1">
                {tpl.milestones.map((m, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs"><Diamond size={10} className="text-[var(--accent)]" fill="currentColor" /><span className="flex-1 truncate">{m.title}</span>{typeof m.offset_pct === "number" && <span className="text-[10px] text-muted num">{m.offset_pct}% of timeline</span>}</li>
                ))}
                {tpl.milestones.length === 0 && <li className="text-xs text-muted">None</li>}
              </ul>
              <div className="text-[11px] text-muted mt-2">Dates are spread across today → due date. Set a due date below to schedule them.</div>
            </div>
          </div>
        )}
      </section>

      {/* Details */}
      <section className="card p-[var(--s4)] space-y-3">
        <Field label="Project name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mauritius investor presentation" required /></Field>
        <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" style={{ minHeight: 72 }} /></Field>
        <Field label="Objectives" hint="What does success look like? One per line."><Textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} placeholder={"Close the funding round\nDeliver final deck by Friday"} style={{ minHeight: 72 }} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Department"><DepartmentPicker value={department} onChange={setDepartment} /></Field>
          <Field label="Owner (accountable)"><PersonPicker value={owner} onChange={setOwner} allowEmpty={false} /></Field>
          <Field label="Priority"><PriorityPicker value={priority} onChange={setPriority} /></Field>
          <Field label="Classification"><ClassificationPicker value={classification} onChange={setClassification} /></Field>
          <Field label="Start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Client (optional)"><Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client or partner name" /></Field>
          <Field label="Tags" hint="Comma separated"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="investor, q4, mauritius" /></Field>
        </div>
      </section>

      {/* Members */}
      <section className="card p-[var(--s4)]">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="h3">Team members <span className="text-xs text-muted font-normal">{members.length ? `· ${members.length} selected` : "· owner is added automatically"}</span></div>
          <div className="w-full sm:w-56"><Input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Filter people…" style={{ height: 32 }} /></div>
        </div>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 max-h-[260px] overflow-y-auto pr-1">
          {visiblePeople.map((p) => {
            const d = departments.find((x) => x.id === p.department_id);
            const on = members.includes(p.id);
            return (
              <label key={p.id} className={cn("flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer row-hover", on && "bg-[var(--info-bg)]")}>
                <input type="checkbox" checked={on} onChange={() => toggleMember(p.id)} className="accent-[var(--brand)]" />
                <Avatar name={p.full_name} src={p.avatar_url} size={22} />
                <span className="min-w-0"><span className="text-sm block truncate">{p.full_name}</span><span className="text-[11px] text-muted block truncate">{p.designation || d?.name || ""}</span></span>
              </label>
            );
          })}
          {visiblePeople.length === 0 && <div className="text-xs text-muted px-2 py-3">No one matches.</div>}
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" variant="primary" loading={loading}>{tpl ? `Create from “${tpl.name}”` : "Create project"}</Button>
      </div>
    </form>
  );
}

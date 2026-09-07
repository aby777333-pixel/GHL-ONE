"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X, Trash2, Users, ChevronDown, ChevronRight, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, EmptyState, Field, Input, Modal, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, slugify, type Tables } from "@/lib/utils";

type Dept = Tables<"departments">;
type Team = Tables<"teams">;

export function DepartmentsAdmin({ departments, teams }: { departments: Dept[]; teams: Team[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, people } = useSession();
  const [editing, setEditing] = React.useState<Dept | "new" | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [newTeamFor, setNewTeamFor] = React.useState<string | null>(null);
  const [teamName, setTeamName] = React.useState("");
  const [teamLead, setTeamLead] = React.useState("");
  const [editTeam, setEditTeam] = React.useState<Team | null>(null);
  const [busy, setBusy] = React.useState(false);

  const person = (id: string | null) => people.find((p) => p.id === id);
  const headcount = (id: string) => people.filter((p) => p.department_id === id).length;

  async function saveTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.org_id) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = editTeam
      ? await supabase.from("teams").update({ name: teamName.trim(), lead_id: teamLead || null }).eq("id", editTeam.id)
      : await supabase.from("teams").insert({ org_id: profile.org_id, department_id: newTeamFor!, name: teamName.trim(), lead_id: teamLead || null });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(editTeam ? "Team updated" : "Team created", "success");
    setNewTeamFor(null); setEditTeam(null); setTeamName(""); setTeamLead("");
    router.refresh();
  }

  async function removeTeam(t: Team) {
    const { error } = await createClient().from("teams").delete().eq("id", t.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Team removed", "success");
    router.refresh();
  }

  return (
    <div className="space-y-[var(--s4)]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted">{departments.length} departments · {teams.length} teams · drag-free ordering via the position field.</div>
        <Button variant="primary" onClick={() => setEditing("new")}><Plus size={15} /> Add department</Button>
      </div>

      {departments.length === 0 ? (
        <Card><EmptyState icon={<Users size={20} />} title="No departments yet" action={<Button variant="primary" onClick={() => setEditing("new")}><Plus size={15} /> Add department</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--s3)]">
          {departments.map((d) => {
            const dTeams = teams.filter((t) => t.department_id === d.id);
            const head = person(d.head_id);
            const isOpen = open[d.id] ?? dTeams.length > 0;
            return (
              <Card key={d.id} className="overflow-hidden" style={{ borderTopColor: d.color, borderTopWidth: 3 }}>
                <div className="flex items-start gap-3 px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)]">
                  <span className="w-9 h-9 rounded-[var(--radius-sm)] shrink-0 flex items-center justify-center text-white text-sm font-semibold" style={{ background: d.color }}>{d.name.slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap"><span className="h3 truncate">{d.name}</span><span className="text-[11px] text-muted">/{d.slug} · #{d.position}</span></div>
                    <div className="text-xs text-muted truncate">{d.description || "No description"}</div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
                      <span className="inline-flex items-center gap-1 text-muted"><Users size={12} /> {headcount(d.id)} people</span>
                      {head ? <span className="pill tone-neutral"><Avatar name={head.full_name} src={head.avatar_url} size={14} /> Head: {head.full_name}</span> : <span className="pill tone-warn"><UserRound size={10} /> No head</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(d)}><Pencil size={13} /> Edit</Button>
                </div>
                <div className="border-t">
                  <button onClick={() => setOpen((o) => ({ ...o, [d.id]: !isOpen }))} className="w-full flex items-center gap-2 px-[var(--s4)] h-9 text-xs text-muted hover:text-[var(--fg)]">
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Teams <span className="num">({dTeams.length})</span>
                    <span className="ml-auto btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); setNewTeamFor(d.id); setEditTeam(null); setTeamName(""); setTeamLead(""); }}><Plus size={12} /> Team</span>
                  </button>
                  {isOpen && (
                    <div className="px-[var(--s4)] pb-[var(--s3)] space-y-1">
                      {dTeams.length === 0 && <div className="text-xs text-muted">No teams — add one to group people under a lead.</div>}
                      {dTeams.map((t) => {
                        const lead = person(t.lead_id);
                        return (
                          <div key={t.id} className="flex items-center gap-2 text-sm py-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />
                            <span className="truncate">{t.name}</span>
                            {lead ? <span className="text-xs text-muted inline-flex items-center gap-1 truncate"><Avatar name={lead.full_name} src={lead.avatar_url} size={14} /> {lead.full_name}</span> : <span className="text-xs text-muted">no lead</span>}
                            <span className="ml-auto flex items-center gap-1">
                              <button className="btn btn-ghost btn-xs btn-icon" onClick={() => { setEditTeam(t); setNewTeamFor(null); setTeamName(t.name); setTeamLead(t.lead_id || ""); }} aria-label="Edit team"><Pencil size={12} /></button>
                              <button className="btn btn-ghost btn-xs btn-icon text-danger" onClick={() => removeTeam(t)} aria-label="Delete team"><Trash2 size={12} /></button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <DepartmentModal dept={editing} onClose={() => setEditing(null)} nextPosition={departments.length} />

      <Modal open={!!newTeamFor || !!editTeam} onClose={() => { setNewTeamFor(null); setEditTeam(null); }} title={editTeam ? `Edit team: ${editTeam.name}` : `New team in ${departments.find((d) => d.id === newTeamFor)?.name || ""}`} width={440}>
        <form onSubmit={saveTeam} className="space-y-3">
          <Field label="Team name"><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Frontend, Inbound sales" required autoFocus /></Field>
          <Field label="Team lead"><PersonPicker value={teamLead} onChange={setTeamLead} placeholder="No lead yet" departmentId={editTeam?.department_id || newTeamFor} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => { setNewTeamFor(null); setEditTeam(null); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}><Check size={15} /> {editTeam ? "Save" : "Create team"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function DepartmentModal({ dept, onClose, nextPosition }: { dept: Dept | "new" | null; onClose: () => void; nextPosition: number }) {
  if (!dept) return null;
  return <DepartmentForm key={dept === "new" ? "new" : dept.id} dept={dept} onClose={onClose} nextPosition={nextPosition} />;
}

function DepartmentForm({ dept, onClose, nextPosition }: { dept: Dept | "new"; onClose: () => void; nextPosition: number }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const isNew = dept === "new";
  const d = dept !== "new" ? dept : null;
  const [name, setName] = React.useState(d?.name || "");
  const [slugInput, setSlugInput] = React.useState(d?.slug || "");
  const [slugTouched, setSlugTouched] = React.useState(!!d);
  const slug = slugTouched ? slugInput : slugify(name);
  const [description, setDescription] = React.useState(d?.description || "");
  const [color, setColor] = React.useState(d?.color || "#6366f1");
  const [headId, setHeadId] = React.useState(d?.head_id || "");
  const [position, setPosition] = React.useState(d ? d.position : nextPosition);
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.org_id) return;
    setBusy(true);
    const supabase = createClient();
    const payload = { name: name.trim(), slug: slugify(slug) || slugify(name), description: description.trim() || null, color, head_id: headId || null, position };
    const { error } = isNew ? await supabase.from("departments").insert({ ...payload, org_id: profile.org_id }) : await supabase.from("departments").update(payload).eq("id", d!.id);
    setBusy(false);
    if (error) { toast.push(error.message.includes("duplicate") ? "A department with this slug already exists" : error.message, "danger"); return; }
    toast.push(isNew ? "Department created" : "Department updated", "success");
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!d) return;
    setBusy(true);
    const { error } = await createClient().from("departments").delete().eq("id", d.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Department deleted", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={isNew ? "New department" : `Edit ${d?.name}`} width={520}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Field label="Slug"><Input value={slug} onChange={(e) => { setSlugInput(e.target.value); setSlugTouched(true); }} /></Field>
          <Field label="Position" hint="Lower shows first"><Input type="number" value={position} onChange={(e) => setPosition(parseInt(e.target.value, 10) || 0)} /></Field>
          <Field label="Colour">
            <div className="flex items-center gap-2">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded-[var(--radius-sm)] border bg-transparent p-0.5 cursor-pointer" />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
            </div>
          </Field>
          <Field label="Department head"><PersonPicker value={headId} onChange={setHeadId} placeholder="No head assigned" /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 64 }} placeholder="What this department owns" /></Field>
        </div>
        <div className={cn("flex items-center gap-2 pt-1", d ? "justify-between" : "justify-end")}>
          {d && !confirm && <Button type="button" variant="ghost" className="text-danger" onClick={() => setConfirm(true)}><Trash2 size={14} /> Delete</Button>}
          {d && confirm && <span className="flex items-center gap-2 text-xs text-danger">Delete permanently? <Button type="button" size="sm" variant="danger" onClick={remove} loading={busy}>Yes, delete</Button><Button type="button" size="sm" variant="ghost" icon onClick={() => setConfirm(false)}><X size={13} /></Button></span>}
          <span className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}><Check size={15} /> {isNew ? "Create" : "Save"}</Button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

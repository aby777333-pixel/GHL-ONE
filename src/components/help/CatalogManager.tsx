"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker, PriorityPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, isAdminRole, slugify, type TaskPriority } from "@/lib/utils";
import { FIELD_TYPES, parseSchema, slaLabel, type FieldType, type FormField, type Service } from "./lib";

const TYPE_LABEL: Record<FieldType, string> = { text: "Short text", textarea: "Long text", select: "Choice", date: "Date", number: "Number" };

/** Department leads / admins manage the service catalog: add, edit, toggle, reorder, and build the request form. */
export function CatalogManager({ services, manageableDepartmentIds }: { services: Service[]; manageableDepartmentIds: string[] }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const admin = isAdminRole(profile.role);
  const [deptId, setDeptId] = React.useState(() => (manageableDepartmentIds.includes(profile.department_id || "") ? profile.department_id! : manageableDepartmentIds[0] || ""));
  const [editing, setEditing] = React.useState<Service | "new" | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const list = React.useMemo(() => services.filter((s) => s.department_id === deptId).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [services, deptId]);

  async function toggle(s: Service) {
    setBusy(s.id);
    const { error } = await createClient().from("service_catalog").update({ active: !s.active }).eq("id", s.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }
  async function move(s: Service, dir: -1 | 1) {
    const i = list.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j]!;
    setBusy(s.id);
    const supabase = createClient();
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("service_catalog").update({ position: j }).eq("id", s.id),
      supabase.from("service_catalog").update({ position: i }).eq("id", other.id),
    ]);
    setBusy(null);
    if (e1 || e2) return toast.push((e1 || e2)!.message, "danger");
    router.refresh();
  }
  async function remove(s: Service) {
    if (!window.confirm(`Delete “${s.name}”? Existing requests keep their history.`)) return;
    setBusy(s.id);
    const { error } = await createClient().from("service_catalog").delete().eq("id", s.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push("Service deleted", "success");
    router.refresh();
  }

  if (!manageableDepartmentIds.length) return <Card><EmptyState icon={<ListPlus size={18} />} title="Nothing to manage here" hint="Department leads manage their own catalog; admins manage all of them." /></Card>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="h3">Service catalog</div>
          <div className="text-xs text-muted">What people can ask this department for, and the form they fill in.</div>
        </div>
        <div className="flex items-center gap-2">
          {manageableDepartmentIds.length > 1 ? (
            <Select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="!w-auto">
              {departments.filter((d) => admin || manageableDepartmentIds.includes(d.id)).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          ) : (
            <Pill tone="tone-violet">{departments.find((d) => d.id === deptId)?.name}</Pill>
          )}
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus size={14} /> Add service</Button>
        </div>
      </div>

      <Card>
        {list.length === 0 ? (
          <EmptyState icon={<ListPlus size={18} />} title="No services yet" hint="Add the first thing people can request from this department." action={<Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus size={14} /> Add service</Button>} />
        ) : (
          <ul className="divide-y">
            {list.map((s, i) => {
              const fields = parseSchema(s.form_schema);
              return (
                <li key={s.id} className={cn("flex items-start gap-3 px-[var(--s3)] py-2.5", !s.active && "opacity-60")}>
                  <span className="text-muted mt-1 hidden sm:block"><GripVertical size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{s.name}</span>
                      {!s.active && <Pill tone="tone-muted">hidden</Pill>}
                      <Pill tone="tone-neutral">{fields.length} field{fields.length === 1 ? "" : "s"}</Pill>
                    </div>
                    {s.description && <div className="text-xs text-muted mt-0.5">{s.description}</div>}
                    <div className="text-[11px] text-muted mt-0.5">{slaLabel(s.sla_ack_minutes)} · default {s.default_priority}{s.default_owner_id ? " · auto-assigned" : ""}</div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button size="xs" variant="ghost" icon aria-label="Move up" disabled={i === 0 || busy === s.id} onClick={() => move(s, -1)}><ArrowUp size={14} /></Button>
                    <Button size="xs" variant="ghost" icon aria-label="Move down" disabled={i === list.length - 1 || busy === s.id} onClick={() => move(s, 1)}><ArrowDown size={14} /></Button>
                    <Button size="xs" variant="ghost" icon aria-label={s.active ? "Hide" : "Show"} loading={busy === s.id} onClick={() => toggle(s)}>{s.active ? <Eye size={14} /> : <EyeOff size={14} />}</Button>
                    <Button size="xs" variant="ghost" icon aria-label="Edit" onClick={() => setEditing(s)}><Pencil size={14} /></Button>
                    <Button size="xs" variant="ghost" icon aria-label="Delete" className="text-danger" onClick={() => remove(s)}><Trash2 size={14} /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ServiceEditor key={editing === "new" ? "new" : editing?.id || "closed"} open={!!editing} service={editing === "new" ? null : editing} departmentId={deptId} canPickDepartment={manageableDepartmentIds.length > 1} onClose={() => setEditing(null)} />
    </div>
  );
}

function ServiceEditor({ open, service, departmentId, canPickDepartment, onClose }: { open: boolean; service: Service | null; departmentId: string; canPickDepartment: boolean; onClose: () => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(service?.name || "");
  const [description, setDescription] = React.useState(service?.description || "");
  const [dept, setDept] = React.useState(service?.department_id || departmentId);
  const [sla, setSla] = React.useState(String(service?.sla_ack_minutes ?? 480));
  const [resolve, setResolve] = React.useState(service?.sla_resolve_minutes ? String(service.sla_resolve_minutes) : "");
  const [priority, setPriority] = React.useState<TaskPriority>(service?.default_priority || "normal");
  const [owner, setOwner] = React.useState(service?.default_owner_id || "");
  const [active, setActive] = React.useState(service?.active ?? true);
  const [fields, setFields] = React.useState<FormField[]>(() => (service ? parseSchema(service.form_schema) : []));
  const [busy, setBusy] = React.useState(false);

  const patchField = (i: number, p: Partial<FormField>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const addField = () => setFields((fs) => [...fs, { key: `field_${fs.length + 1}`, label: "", type: "text", required: false }]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const cleaned = fields
      .filter((f) => f.label.trim())
      .map((f) => ({ key: slugify(f.key || f.label).replace(/-/g, "_") || slugify(f.label).replace(/-/g, "_"), label: f.label.trim(), type: f.type, required: !!f.required, ...(f.type === "select" ? { options: (f.options || []).map((o) => o.trim()).filter(Boolean) } : {}) }));
    const keys = new Set<string>();
    for (const f of cleaned) {
      if (keys.has(f.key)) return toast.push(`Two fields share the key “${f.key}”`, "danger");
      keys.add(f.key);
      if (f.type === "select" && !(f.options || []).length) return toast.push(`“${f.label}” needs at least one option`, "danger");
    }
    setBusy(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      department_id: dept,
      sla_ack_minutes: Math.max(1, Number(sla) || 480),
      sla_resolve_minutes: resolve ? Math.max(1, Number(resolve)) : null,
      default_priority: priority,
      default_owner_id: owner || null,
      active,
      form_schema: cleaned,
    };
    const supabase = createClient();
    const { error } = service ? await supabase.from("service_catalog").update(payload).eq("id", service.id) : await supabase.from("service_catalog").insert({ ...payload, org_id: profile.org_id! });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push(service ? "Service updated" : "Service added", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={service ? `Edit · ${service.name}` : "New service"} width={640}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Poster / creative" required autoFocus /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line on what this covers." style={{ minHeight: 56 }} /></Field>
          {canPickDepartment && <Field label="Department"><DepartmentPicker value={dept} onChange={setDept} allowEmpty={false} /></Field>}
          <Field label="Acknowledge within (minutes)" hint={slaLabel(Number(sla) || 0)}><Input type="number" min={1} value={sla} onChange={(e) => setSla(e.target.value)} /></Field>
          <Field label="Resolve within (minutes, optional)"><Input type="number" min={1} value={resolve} onChange={(e) => setResolve(e.target.value)} /></Field>
          <Field label="Default priority"><PriorityPicker value={priority} onChange={setPriority} /></Field>
          <Field label="Auto-assign to (optional)"><PersonPicker value={owner} onChange={setOwner} placeholder="Whoever accepts first" departmentId={dept} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-[var(--brand)]" checked={active} onChange={(e) => setActive(e.target.checked)} /> Visible to requesters</label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="label !mb-0">Request form</span>
            <Button type="button" size="xs" variant="secondary" onClick={addField}><Plus size={12} /> Add field</Button>
          </div>
          {fields.length === 0 ? (
            <div className="text-xs text-muted border border-dashed rounded-[var(--radius-sm)] px-3 py-4 text-center">No extra fields — requesters only fill in title, details, priority and deadline.</div>
          ) : (
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="rounded-[var(--radius-sm)] border p-2.5 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto_auto] items-end">
                    <Field label="Label"><Input value={f.label} onChange={(e) => patchField(i, { label: e.target.value, key: f.key.startsWith("field_") ? slugify(e.target.value).replace(/-/g, "_") || f.key : f.key })} placeholder="e.g. Deadline" /></Field>
                    <Field label="Type">
                      <Select value={f.type} onChange={(e) => patchField(i, { type: e.target.value as FieldType })}>
                        {FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                        ))}
                      </Select>
                    </Field>
                    <label className="flex items-center gap-1.5 text-xs h-[38px]"><input type="checkbox" className="accent-[var(--brand)]" checked={!!f.required} onChange={(e) => patchField(i, { required: e.target.checked })} /> Required</label>
                    <div className="flex items-center gap-0.5 h-[38px]">
                      <Button type="button" size="xs" variant="ghost" icon aria-label="Up" disabled={i === 0} onClick={() => setFields((fs) => { const n = [...fs]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n; })}><ArrowUp size={13} /></Button>
                      <Button type="button" size="xs" variant="ghost" icon aria-label="Down" disabled={i === fields.length - 1} onClick={() => setFields((fs) => { const n = [...fs]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; return n; })}><ArrowDown size={13} /></Button>
                      <Button type="button" size="xs" variant="ghost" icon aria-label="Remove" className="text-danger" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}><X size={13} /></Button>
                    </div>
                  </div>
                  {f.type === "select" && (
                    <Field label="Options (one per line)">
                      <Textarea value={(f.options || []).join("\n")} onChange={(e) => patchField(i, { options: e.target.value.split("\n") })} placeholder={"View\nEdit\nAdmin"} style={{ minHeight: 56 }} />
                    </Field>
                  )}
                  <div className="text-[10px] text-muted">key: <code>{f.key}</code></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>{service ? "Save changes" : "Add service"}</Button>
        </div>
      </form>
    </Modal>
  );
}

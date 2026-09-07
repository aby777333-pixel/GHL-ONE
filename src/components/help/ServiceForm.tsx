"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Clock, FileText, Paperclip, Send, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, EmptyState, Field, Input, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PriorityPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { bytes, cn, type TaskPriority } from "@/lib/utils";
import type { Availability } from "@/components/common/CommonHub";
import { asDeptStatus, DEPT_STATUS_META, parseSchema, slaLabel, type FormField, type HelpAttachment, type Service } from "./lib";

const SOMETHING_ELSE = "__other__";
const MAX_FILE = 25 * 1024 * 1024;

function safeName(n: string) {
  return n.replace(/[^\w.\-]+/g, "_").slice(-80);
}

export function ServiceForm({ availability, services, initialDept, initialService, onCreated }: { availability: Availability[]; services: Service[]; initialDept?: string | null; initialService?: string | null; onCreated?: (id: string) => void }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [deptId, setDeptId] = React.useState<string | null>(() => {
    if (!initialDept) return null;
    return availability.find((a) => a.slug === initialDept || a.department_id === initialDept)?.department_id || null;
  });
  const [serviceId, setServiceId] = React.useState<string | null>(() => (initialService && services.some((s) => s.id === initialService) ? initialService : null));

  const dept = availability.find((a) => a.department_id === deptId) || null;
  const deptServices = React.useMemo(() => services.filter((s) => s.department_id === deptId && s.active).sort((a, b) => a.position - b.position), [services, deptId]);
  const service = serviceId && serviceId !== SOMETHING_ELSE ? deptServices.find((s) => s.id === serviceId) || null : null;

  // ---- Step 1: pick a department
  if (!dept) {
    return (
      <div className="space-y-3">
        <div>
          <div className="h3">Ask a department</div>
          <div className="text-xs text-muted mt-0.5">Pick who you need. You will see what they offer, how fast they usually answer and who is on duty.</div>
        </div>
        {availability.length === 0 ? (
          <Card><EmptyState icon={<Building2 size={18} />} title="No departments yet" /></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {availability.map((a) => {
              const st = asDeptStatus(a.status);
              const onDuty = a.on_duty_user_id ? people.find((p) => p.id === a.on_duty_user_id) : undefined;
              return (
                <button key={a.department_id} type="button" onClick={() => { setDeptId(a.department_id); setServiceId(null); }} className="card card-hover p-[var(--s3)] text-left flex flex-col gap-2 min-w-0" style={{ borderTop: `3px solid ${a.color}` }}>
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-white font-semibold shrink-0" style={{ background: a.color }}>{a.name.slice(0, 1)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0"><span className="font-medium truncate">{a.name}</span><Blink zone={`dept:${a.department_id}`} /></div>
                      <div className="text-[11px] text-muted">{a.services} service{a.services === 1 ? "" : "s"} · {a.available} available now</div>
                    </div>
                    <Pill tone={DEPT_STATUS_META[st].tone}>{DEPT_STATUS_META[st].label}</Pill>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted mt-auto">
                    {onDuty ? <span className="inline-flex items-center gap-1.5"><Avatar name={onDuty.full_name} src={onDuty.avatar_url} size={18} presence={onDuty.presence} /> {onDuty.full_name.split(" ")[0]} on duty</span> : <span>No one on duty</span>}
                    {a.avg_ack_minutes > 0 && <span className="ml-auto inline-flex items-center gap-1 num"><Clock size={11} /> ~{a.avg_ack_minutes < 60 ? `${a.avg_ack_minutes}m` : `${Math.round(a.avg_ack_minutes / 60)}h`} to reply</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const st = asDeptStatus(dept.status);

  // ---- Step 2: pick a service
  if (!serviceId) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setDeptId(null)} className="inline-flex items-center gap-1 text-xs text-muted hover:underline"><ArrowLeft size={12} /> All departments</button>
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-white font-semibold shrink-0" style={{ background: dept.color }}>{dept.name.slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap"><span className="h3">{dept.name}</span><Pill tone={DEPT_STATUS_META[st].tone}>{DEPT_STATUS_META[st].label}</Pill></div>
            <div className="text-xs text-muted mt-0.5">{DEPT_STATUS_META[st].hint} {dept.avg_ack_minutes > 0 ? `Replies in about ${dept.avg_ack_minutes < 60 ? `${dept.avg_ack_minutes} minutes` : `${Math.round(dept.avg_ack_minutes / 60)} hours`} on average.` : ""}</div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {deptServices.map((s) => (
            <button key={s.id} type="button" onClick={() => setServiceId(s.id)} className="card card-hover p-3 text-left flex items-start gap-3 min-w-0">
              <span className="w-8 h-8 rounded-[var(--radius-sm)] tone-info flex items-center justify-center shrink-0"><FileText size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{s.name}</span>
                {s.description && <span className="block text-[11px] text-muted truncate-2 leading-snug">{s.description}</span>}
                <span className="block text-[11px] text-muted mt-1 inline-flex items-center gap-1"><Clock size={10} /> {slaLabel(s.sla_ack_minutes)}</span>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => setServiceId(SOMETHING_ELSE)} className="card card-hover p-3 text-left flex items-start gap-3 min-w-0 border-dashed">
            <span className="w-8 h-8 rounded-[var(--radius-sm)] tone-neutral flex items-center justify-center shrink-0"><Sparkles size={15} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Something else</span>
              <span className="block text-[11px] text-muted leading-snug">Describe what you need in your own words.</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  // ---- Step 3: the form
  return (
    <RequestForm
      key={`${dept.department_id}:${serviceId}`}
      dept={dept}
      service={service}
      onBack={() => setServiceId(null)}
      onCreated={(id) => {
        toast.push("Request sent", "success");
        router.refresh();
        if (onCreated) onCreated(id);
        else router.push(`/help/${id}`);
      }}
      profileId={profile.id}
      orgId={profile.org_id!}
      departmentId={profile.department_id}
    />
  );
}

function RequestForm({ dept, service, onBack, onCreated, profileId, orgId, departmentId }: { dept: Availability; service: Service | null; onBack: () => void; onCreated: (id: string) => void; profileId: string; orgId: string; departmentId: string | null }) {
  const toast = useToast();
  const fields = React.useMemo<FormField[]>(() => (service ? parseSchema(service.form_schema) : []), [service]);
  const [title, setTitle] = React.useState(service ? service.name : "");
  const [details, setDetails] = React.useState("");
  const [priority, setPriority] = React.useState<TaskPriority>(service?.default_priority || "normal");
  const [neededBy, setNeededBy] = React.useState("");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [onBoard, setOnBoard] = React.useState(true);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const setVal = (k: string, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  };

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE) toast.push(`${f.name} is over ${bytes(MAX_FILE)}`, "danger");
      else next.push(f);
    }
    setFiles((s) => [...s, ...next].slice(0, 8));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs._title = "Give the request a title";
    for (const f of fields) if (f.required && !(values[f.key] || "").trim()) errs[f.key] = "Required";
    if (!service && !details.trim()) errs._details = "Tell them what you need";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const supabase = createClient();
    const id = crypto.randomUUID();
    const attachments: HelpAttachment[] = [];
    for (const f of files) {
      const path = `help/${id}/${Date.now()}-${safeName(f.name)}`;
      const { error } = await supabase.storage.from("chat").upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
      if (error) {
        setBusy(false);
        return toast.push(`Upload failed for ${f.name}: ${error.message}`, "danger");
      }
      attachments.push({ name: f.name, path, size: f.size, type: f.type || "application/octet-stream" });
    }
    const form_data: Record<string, string> = {};
    for (const f of fields) if (values[f.key] != null && values[f.key] !== "") form_data[f.key] = values[f.key]!;
    const { error } = await supabase.from("help_requests").insert({
      id,
      org_id: orgId,
      department_id: dept.department_id,
      service_id: service?.id || null,
      requester_id: profileId,
      requester_department_id: departmentId,
      title: title.trim(),
      details: details.trim() || null,
      priority,
      form_data,
      attachments,
      deadline: neededBy ? new Date(neededBy).toISOString() : null,
      visible_on_board: onBoard,
    });
    setBusy(false);
    if (error) {
      if (attachments.length) await supabase.storage.from("chat").remove(attachments.map((a) => a.path));
      return toast.push(error.message, "danger");
    }
    onCreated(id);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted hover:underline"><ArrowLeft size={12} /> {dept.name} services</button>
      <div className="flex items-start gap-3 rounded-[var(--radius-sm)] sunken px-3 py-2.5">
        <span className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center text-white font-semibold shrink-0" style={{ background: dept.color }}>{dept.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{service ? service.name : "Something else"} <span className="text-muted font-normal">· {dept.name}</span></div>
          <div className="text-[11px] text-muted inline-flex items-center gap-1 mt-0.5"><Clock size={11} /> {service ? slaLabel(service.sla_ack_minutes) : dept.avg_ack_minutes > 0 ? `Replies in about ${dept.avg_ack_minutes < 60 ? `${dept.avg_ack_minutes} minutes` : `${Math.round(dept.avg_ack_minutes / 60)} hours`}` : "Usually acknowledged the same day"}</div>
        </div>
      </div>

      <Field label="Title" hint={errors._title}>
        <Input value={title} onChange={(e) => { setTitle(e.target.value); setErrors((er) => ({ ...er, _title: "" })); }} className={cn(errors._title && "border-[var(--danger)]")} required autoFocus={!service} />
      </Field>

      {fields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <DynamicField key={f.key} f={f} value={values[f.key] || ""} error={errors[f.key]} onChange={(v) => setVal(f.key, v)} className={f.type === "textarea" ? "sm:col-span-2" : undefined} />
          ))}
        </div>
      )}

      <Field label={service ? "Anything else they should know?" : "What do you need?"} hint={errors._details}>
        <Textarea value={details} onChange={(e) => { setDetails(e.target.value); setErrors((er) => ({ ...er, _details: "" })); }} placeholder="Context, links, what good looks like…" style={{ minHeight: 84 }} className={cn(errors._details && "border-[var(--danger)]")} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Priority">
          <PriorityPicker value={priority} onChange={setPriority} />
        </Field>
        <Field label="Needed by (optional)">
          <Input type="datetime-local" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="label !mb-0">Attachments</span>
          <span className="text-[11px] text-muted">Up to 8 files · {bytes(MAX_FILE)} each</span>
        </div>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="pill pill-lg tone-neutral max-w-full">
              <Paperclip size={11} /> <span className="truncate max-w-[180px]">{f.name}</span> <span className="text-muted num">{bytes(f.size)}</span>
              <button type="button" onClick={() => setFiles((s) => s.filter((_, j) => j !== i))} aria-label="Remove" className="ml-0.5"><X size={11} /></button>
            </span>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Paperclip size={13} /> Add file</Button>
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-xs cursor-pointer">
        <input type="checkbox" className="accent-[var(--brand)] mt-0.5" checked={onBoard} onChange={(e) => setOnBoard(e.target.checked)} />
        <span><span className="text-2">Show on the “Who needs help” board</span><span className="block text-muted">Lets anyone in the company step in if the department is busy. Untick for anything sensitive.</span></span>
      </label>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" loading={busy}><Send size={14} /> Send request</Button>
      </div>
    </form>
  );
}

function DynamicField({ f, value, error, onChange, className }: { f: FormField; value: string; error?: string; onChange: (v: string) => void; className?: string }) {
  const label = f.required ? `${f.label} *` : f.label;
  const invalid = error ? "border-[var(--danger)]" : undefined;
  return (
    <Field label={label} hint={error} className={className}>
      {f.type === "textarea" ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} style={{ minHeight: 72 }} className={invalid} />
      ) : f.type === "select" ? (
        <Select value={value} onChange={(e) => onChange(e.target.value)} className={invalid}>
          <option value="">Choose…</option>
          {(f.options || []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      ) : f.type === "date" ? (
        <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={invalid} />
      ) : f.type === "number" ? (
        <Input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={invalid} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className={invalid} />
      )}
    </Field>
  );
}


"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Building2, Clock, ExternalLink, FileText, Hash, LifeBuoy, Pencil, Plus, Send, ShieldAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, EmptyState, Field, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn, type Channel, type Department } from "@/lib/utils";
import { asDeptStatus, DEPT_STATUSES, DEPT_STATUS_META, OPEN_STATUSES, slaLabel, type DeptStatus, type Service } from "@/components/help/lib";
import { HelpRequestRow, useNow, type HelpRow } from "@/components/help/HelpBits";
import { asVisibility, VISIBILITY_META } from "@/components/common/visibility";
import { EntityLive } from "@/components/live/EntityLive";

/* ------------------------------------------------------------ status panel */
/** Status · on-duty · services intro · escalation ladder. Editable by heads / on-duty / managers+ / department leads. */
export function DepartmentStatusPanel({ d, canEdit }: { d: Department; canEdit: boolean }) {
  const { people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const status = asDeptStatus(d.status);
  const meta = DEPT_STATUS_META[status];
  const onDuty = d.on_duty_user_id ? people.find((p) => p.id === d.on_duty_user_id) : undefined;
  const [open, setOpen] = React.useState(false);
  const [st, setSt] = React.useState<DeptStatus>(status);
  const [duty, setDuty] = React.useState(d.on_duty_user_id || "");
  const [intro, setIntro] = React.useState(d.services_intro || "");
  const [ladder, setLadder] = React.useState<string[]>(d.escalation_matrix || []);
  const [pick, setPick] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [quick, setQuick] = React.useState<DeptStatus | null>(null);

  async function quickStatus(s: DeptStatus) {
    setQuick(s);
    const { error } = await createClient().from("departments").update({ status: s }).eq("id", d.id);
    setQuick(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(`${d.name} is now ${DEPT_STATUS_META[s].label.toLowerCase()}`, "success");
    router.refresh();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from("departments").update({ status: st, on_duty_user_id: duty || null, services_intro: intro.trim() || null, escalation_matrix: ladder }).eq("id", d.id);
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Department status updated", "success");
    setOpen(false);
    router.refresh();
  }

  return (
    <Card className="p-[var(--s4)]">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="h3">Right now</span>
            <Pill tone={meta.tone} size="lg">{meta.label}</Pill>
          </div>
          <div className="text-xs text-muted mt-0.5">{meta.hint}</div>
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted">On duty</span>
              {onDuty ? <span className="inline-flex items-center gap-1.5"><Avatar name={onDuty.full_name} src={onDuty.avatar_url} size={20} presence={onDuty.presence} /> {onDuty.full_name}</span> : <span className="text-muted">Nobody</span>}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted">Escalation</span>
              {ladder.length ? (
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {ladder.map((id, i) => (
                    <span key={id} className="inline-flex items-center gap-1"><PersonChip id={id} size={16} />{i < ladder.length - 1 && <span className="text-muted">→</span>}</span>
                  ))}
                  {d.head_id && <span className="text-muted">→ <PersonChip id={d.head_id} size={16} className="inline-flex" /></span>}
                </span>
              ) : d.head_id ? (
                <PersonChip id={d.head_id} size={16} />
              ) : (
                <span className="text-muted">Not set</span>
              )}
            </span>
          </div>
          {d.services_intro && <p className="text-sm text-2 mt-3 max-w-2xl">{d.services_intro}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EntityLive ctx={{ departmentId: d.id, title: `${d.name} room` }} label="Department room" />
            <span className="text-[11px] text-muted">The department&apos;s always-on room — walk in, ask, walk out.</span>
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex flex-wrap gap-1 justify-end">
              {DEPT_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => quickStatus(s)} disabled={quick !== null} className={cn("pill cursor-pointer", s === status ? DEPT_STATUS_META[s].tone : "tone-neutral", quick === s && "opacity-60")} title={DEPT_STATUS_META[s].hint}>
                  {DEPT_STATUS_META[s].label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setSt(status); setDuty(d.on_duty_user_id || ""); setIntro(d.services_intro || ""); setLadder(d.escalation_matrix || []); setOpen(true); }}><Pencil size={13} /> Availability & escalation</Button>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`${d.name} · availability`} width={560}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status" hint={DEPT_STATUS_META[st].hint}>
              <Select value={st} onChange={(e) => setSt(e.target.value as DeptStatus)}>
                {DEPT_STATUSES.map((s) => (
                  <option key={s} value={s}>{DEPT_STATUS_META[s].label}</option>
                ))}
              </Select>
            </Field>
            <Field label="On duty" hint="First to be notified of new requests.">
              <PersonPicker value={duty} onChange={setDuty} placeholder="Nobody" departmentId={d.id} />
            </Field>
          </div>
          <Field label="Services intro" hint="Shown at the top of your services on the Help Desk.">
            <Textarea value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="e.g. We handle devices, access and the website. For urgent outages call the on-duty person." style={{ minHeight: 72 }} />
          </Field>
          <div>
            <span className="label">Escalation ladder</span>
            <div className="text-[11px] text-muted mb-2 inline-flex items-start gap-1.5"><ShieldAlert size={12} className="mt-0.5 shrink-0" /> When a request is not acknowledged within its SLA, it escalates one step at a time — then to the department head, then to executives.</div>
            <ol className="space-y-1 mb-2">
              {ladder.map((id, i) => (
                <li key={id} className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-2 py-1.5">
                  <span className="text-[11px] text-muted num w-4">{i + 1}.</span>
                  <PersonChip id={id} size={20} className="flex-1 min-w-0" />
                  <Button type="button" size="xs" variant="ghost" icon aria-label="Up" disabled={i === 0} onClick={() => setLadder((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n; })}><ArrowUp size={13} /></Button>
                  <Button type="button" size="xs" variant="ghost" icon aria-label="Down" disabled={i === ladder.length - 1} onClick={() => setLadder((l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; return n; })}><ArrowDown size={13} /></Button>
                  <Button type="button" size="xs" variant="ghost" icon aria-label="Remove" className="text-danger" onClick={() => setLadder((l) => l.filter((x) => x !== id))}><X size={13} /></Button>
                </li>
              ))}
              {d.head_id && <li className="flex items-center gap-2 px-2 py-1 text-xs text-muted"><span className="num w-4">{ladder.length + 1}.</span> <PersonChip id={d.head_id} size={18} /> <span>(head — always last)</span></li>}
            </ol>
            <div className="flex gap-2">
              <PersonPicker value={pick} onChange={setPick} placeholder="Add a step" className="flex-1" />
              <Button type="button" variant="secondary" disabled={!pick || ladder.includes(pick)} onClick={() => { setLadder((l) => [...l, pick]); setPick(""); }}><Plus size={14} /> Add</Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Save</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

/* --------------------------------------------------------- services list */
export function DepartmentServices({ d, services, canManage }: { d: Department; services: Service[]; canManage: boolean }) {
  const active = services.filter((s) => s.active).sort((a, b) => a.position - b.position);
  return (
    <Card className="p-[var(--s4)]">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div>
          <div className="h3">Services we offer</div>
          <div className="text-xs text-muted">Ask {d.name} for any of these — each has an SLA and lands with the right person.</div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && <Link href="/help?tab=catalog" className="btn btn-ghost btn-sm"><Pencil size={13} /> Manage catalog</Link>}
          <Link href={`/help?dept=${d.slug}`} className="btn btn-secondary btn-sm"><LifeBuoy size={14} /> Something else</Link>
        </div>
      </div>
      {active.length === 0 ? (
        <EmptyState icon={<FileText size={18} />} title="No services listed yet" hint={canManage ? "Add the things people can request from this department." : `You can still ask ${d.name} for anything from the Help Desk.`} action={canManage ? <Link href="/help?tab=catalog" className="btn btn-primary btn-sm"><Plus size={14} /> Add a service</Link> : undefined} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {active.map((s) => (
            <li key={s.id} className="rounded-[var(--radius-sm)] border p-3 flex items-start gap-3 min-w-0">
              <span className="w-8 h-8 rounded-[var(--radius-sm)] tone-info flex items-center justify-center shrink-0"><FileText size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{s.name}</div>
                {s.description && <div className="text-[11px] text-muted truncate-2 leading-snug">{s.description}</div>}
                <div className="text-[11px] text-muted mt-1 inline-flex items-center gap-1"><Clock size={10} /> {slaLabel(s.sla_ack_minutes)}</div>
              </div>
              <Link href={`/help?dept=${d.slug}&service=${s.id}`} className="btn btn-primary btn-xs shrink-0"><Send size={12} /> Request</Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------- open requests */
export function DepartmentOpenRequests({ d, requests, canWork }: { d: Department; requests: HelpRow[]; canWork: boolean }) {
  const now = useNow();
  const open = requests.filter((r) => OPEN_STATUSES.includes(r.status));
  const unowned = open.filter((r) => r.status === "new").length;
  const over = open.filter((r) => r.status === "new" && r.ack_due_at && new Date(r.ack_due_at).getTime() < now).length;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)] flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="h3">Open requests</span>
          <span className="pill tone-neutral num">{open.length}</span>
          {unowned > 0 && <span className="pill tone-warn num">{unowned} unaccepted</span>}
          {over > 0 && <span className="pill tone-danger num">{over} over SLA</span>}
        </div>
        {canWork && <Link href={`/help?tab=queue`} className="text-xs link">Open queue</Link>}
      </div>
      {open.length === 0 ? (
        <div className="px-[var(--s4)] pb-[var(--s3)] text-xs text-muted">Nothing waiting on {d.name} right now.</div>
      ) : (
        <div className="divide-y border-t">
          {open.slice(0, 8).map((r) => (
            <HelpRequestRow key={r.id} r={r} now={now} showDepartment={false} />
          ))}
          {open.length > 8 && <div className="px-[var(--s4)] py-2 text-xs text-muted">+{open.length - 8} more in the queue</div>}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------- open channels */
export function DepartmentChannels({ d, channels }: { d: Department; channels: (Pick<Channel, "id" | "name" | "description" | "purpose" | "visibility" | "type" | "last_message_at"> & { members?: number })[] }) {
  return (
    <Card className="p-[var(--s4)]">
      <div className="h3 mb-0.5">Department channels</div>
      <div className="text-xs text-muted mb-2">Open to everyone in {d.name}. Others can be brought in with a reason.</div>
      {channels.length === 0 ? (
        <div className="text-xs text-muted">No department-open channels yet. Create one from GHL Common with visibility “Department”.</div>
      ) : (
        <ul className="space-y-1">
          {channels.map((c) => {
            const vis = asVisibility(c.visibility);
            return (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-sm)] row-hover">
                  <span className={cn("w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0", c.type === "department" ? "tone-violet" : "tone-info")}>{c.type === "department" ? <Building2 size={15} /> : <Hash size={15} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium truncate">#{c.name} <Blink zone={`channel:${c.id}`} /></span>
                    <span className="block text-[11px] text-muted truncate">{c.purpose || c.description || VISIBILITY_META[vis].who}</span>
                  </span>
                  {c.last_message_at && <span className="text-[11px] text-muted shrink-0">{ago(c.last_message_at)}</span>}
                  <ExternalLink size={13} className="text-muted shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

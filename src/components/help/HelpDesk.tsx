"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CheckCheck, Flame, Inbox, KanbanSquare, LifeBuoy, ListPlus, Send, Siren, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, PageHeader, Select, Tabs, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import type { Json } from "@/lib/database.types";
import { isAdminRole, isInternal, isLeadPlus, isManagerPlus, PRIORITIES, PRIORITY_LABEL } from "@/lib/utils";
import type { Availability } from "@/components/common/CommonHub";
import { HelpRequestRow, useNow, type HelpRow } from "./HelpBits";
import { HELP_STATUSES, HELP_STATUS_LABEL, OPEN_STATUSES, type HelpStatus, type Service } from "./lib";
import { RequestActions } from "./RequestActions";
import { ServiceForm } from "./ServiceForm";
import { HelpBoard } from "./HelpBoard";
import { CatalogManager } from "./CatalogManager";
import { UrgentAssistanceModal } from "./UrgentAssistanceModal";
import { WarRoomModal } from "./WarRoomModal";
import { IncidentsList } from "./IncidentsList";

export type QueueRow = HelpRow & { form_data: Json };

export type HelpDeskData = {
  availability: Availability[];
  services: Service[];
  mine: QueueRow[];
  queue: QueueRow[];
  initialTab?: string;
  initialDept?: string | null;
  initialService?: string | null;
};

const TABS = ["ask", "mine", "queue", "board", "catalog"] as const;
type Tab = (typeof TABS)[number];

export function HelpDesk({ data }: { data: HelpDeskData }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const now = useNow();
  const manager = isManagerPlus(profile.role);
  const admin = isAdminRole(profile.role);
  const lead = isLeadPlus(profile.role);
  const myDept = profile.department_id;
  const canQueue = manager || !!myDept;
  const manageable = admin ? departments.map((d) => d.id) : lead && myDept ? [myDept] : [];

  const [tab, setTab] = React.useState<Tab>(() => ((TABS as readonly string[]).includes(data.initialTab || "") ? (data.initialTab as Tab) : "ask"));
  const [rows, setRows] = React.useState<QueueRow[]>(data.queue);
  const [mine, setMine] = React.useState<QueueRow[]>(data.mine);
  const [status, setStatus] = React.useState<"open" | HelpStatus | "all">("open");
  const [prio, setPrio] = React.useState("");
  const [svc, setSvc] = React.useState("");
  const [dept, setDept] = React.useState(manager ? "" : myDept || "");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulkOwner, setBulkOwner] = React.useState("");
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [urgent, setUrgent] = React.useState(false);
  const [warRoom, setWarRoom] = React.useState(false);

  // keep local rows in sync when the server refreshes
  React.useEffect(() => {
    const t = setTimeout(() => setRows(data.queue), 0);
    return () => clearTimeout(t);
  }, [data.queue]);
  React.useEffect(() => {
    const t = setTimeout(() => setMine(data.mine), 0);
    return () => clearTimeout(t);
  }, [data.mine]);

  const serviceName = (id: string | null) => (id ? data.services.find((s) => s.id === id)?.name : null) || null;

  function go(t: Tab) {
    setTab(t);
    router.replace(t === "ask" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  }

  const patch = React.useCallback((id: string, p: Partial<QueueRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
    setMine((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }, []);

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (dept && r.department_id !== dept) return false;
      if (status === "open" ? !OPEN_STATUSES.includes(r.status) : status !== "all" && r.status !== status) return false;
      if (prio && r.priority !== prio) return false;
      if (svc && r.service_id !== svc) return false;
      return true;
    });
  }, [rows, dept, status, prio, svc]);

  const queueServices = React.useMemo(() => data.services.filter((s) => !dept || s.department_id === dept), [data.services, dept]);

  async function bulkAssign() {
    if (!bulkOwner || !selected.size) return;
    setBulkBusy(true);
    const ids = [...selected];
    const { error } = await createClient().from("help_requests").update({ owner_id: bulkOwner }).in("id", ids);
    setBulkBusy(false);
    if (error) return toast.push(error.message, "danger");
    for (const id of ids) patch(id, { owner_id: bulkOwner });
    setSelected(new Set());
    setBulkOwner("");
    toast.push(`${ids.length} request${ids.length === 1 ? "" : "s"} assigned`, "success");
    router.refresh();
  }

  async function move(id: string, to: HelpStatus) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const p: Partial<QueueRow> = { status: to, ...(to === "accepted" && !r.owner_id ? { owner_id: profile.id } : {}) };
    patch(id, p);
    const { error } = await createClient().from("help_requests").update(p).eq("id", id);
    if (error) {
      patch(id, { status: r.status, owner_id: r.owner_id });
      toast.push(error.message, "danger");
      return;
    }
    router.refresh();
  }

  const openMine = mine.filter((r) => OPEN_STATUSES.includes(r.status));
  const openQueue = rows.filter((r) => OPEN_STATUSES.includes(r.status) && (!myDept || manager || r.department_id === myDept));

  const tabs: { key: Tab; label: React.ReactNode; count?: number }[] = [
    { key: "ask", label: <span className="inline-flex items-center gap-1.5"><Send size={13} /> Ask a department</span> },
    { key: "mine", label: <span className="inline-flex items-center gap-1.5"><Inbox size={13} /> My requests</span>, count: openMine.length },
    ...(canQueue ? [{ key: "queue" as Tab, label: <span className="inline-flex items-center gap-1.5"><LifeBuoy size={13} /> Department queue</span>, count: openQueue.length }] : []),
    ...(manager ? [{ key: "board" as Tab, label: <span className="inline-flex items-center gap-1.5"><KanbanSquare size={13} /> Board</span> }] : []),
    ...(manageable.length ? [{ key: "catalog" as Tab, label: <span className="inline-flex items-center gap-1.5"><ListPlus size={13} /> Catalog</span> }] : []),
  ];

  return (
    <div className="page space-y-[var(--s4)] anim-fade-up">
      <PageHeader
        eyebrow="Help Desk"
        title="Ask any department"
        subtitle="Pick a service, fill in the form and the right people get it — with an SLA, an owner and a room to talk in."
        actions={
          <>
            <Link href="/common" className="btn btn-secondary btn-sm">GHL Common</Link>
            {lead && <Button size="sm" variant="secondary" onClick={() => setWarRoom(true)}><Flame size={14} /> Start war room</Button>}
            <Button size="sm" variant="danger" onClick={() => setUrgent(true)}><Siren size={14} /> Urgent assistance</Button>
          </>
        }
      />
      <UrgentAssistanceModal open={urgent} onClose={() => setUrgent(false)} />
      {lead && <WarRoomModal open={warRoom} onClose={() => setWarRoom(false)} />}
      <Tabs<Tab> tabs={tabs} value={tab} onChange={go} className="-mx-[var(--s4)] px-[var(--s4)] lg:-mx-[var(--s5)] lg:px-[var(--s5)] sticky top-[var(--topbar-h)] z-20 glass" />

      <div key={tab} className="anim-fade-in">
        {tab === "ask" && (
          <Card className="p-[var(--s4)]">
            <ServiceForm availability={data.availability} services={data.services} initialDept={data.initialDept} initialService={data.initialService} />
          </Card>
        )}

        {tab === "mine" && (
          <Card>
            {mine.length === 0 ? (
              <EmptyState icon={<Inbox size={18} />} title="You have not asked for anything yet" hint="When you do, you can follow the status, the owner and the SLA here." action={<Button size="sm" variant="primary" onClick={() => go("ask")}><Send size={14} /> Ask a department</Button>} />
            ) : (
              <div className="divide-y">
                {[...mine].sort((a, b) => Number(OPEN_STATUSES.includes(b.status)) - Number(OPEN_STATUSES.includes(a.status)) || b.created_at.localeCompare(a.created_at)).map((r) => (
                  <HelpRequestRow key={r.id} r={r} now={now} serviceName={serviceName(r.service_id)} showRequester={false} />
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === "queue" && canQueue && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {manager && <DepartmentPicker value={dept} onChange={(v) => { setDept(v); setSvc(""); }} placeholder="All departments" className="!w-auto" />}
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="!w-auto">
                <option value="open">Open</option>
                <option value="all">All statuses</option>
                {HELP_STATUSES.map((s) => (
                  <option key={s} value={s}>{HELP_STATUS_LABEL[s]}</option>
                ))}
              </Select>
              <Select value={prio} onChange={(e) => setPrio(e.target.value)} className="!w-auto">
                <option value="">Any priority</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </Select>
              <Select value={svc} onChange={(e) => setSvc(e.target.value)} className="!w-auto">
                <option value="">Any service</option>
                {queueServices.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <span className="text-xs text-muted num ml-auto">{filtered.length} request{filtered.length === 1 ? "" : "s"}</span>
            </div>

            {selected.size > 0 && (
              <div className="card px-3 py-2 flex flex-wrap items-center gap-2 anim-pop" style={{ borderColor: "var(--brand)" }}>
                <CheckCheck size={14} className="text-[var(--brand-2)]" />
                <span className="text-sm">{selected.size} selected</span>
                <PersonPicker value={bulkOwner} onChange={setBulkOwner} placeholder="Assign to…" className="!w-auto min-w-[200px]" departmentId={dept || undefined} />
                <Button size="sm" variant="primary" disabled={!bulkOwner} loading={bulkBusy} onClick={bulkAssign}><UserPlus size={14} /> Assign</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            )}

            <Card>
              {filtered.length === 0 ? (
                <EmptyState icon={<LifeBuoy size={18} />} title="Queue is clear" hint="Nothing matches these filters." />
              ) : (
                <div className="divide-y">
                  {filtered.map((r) => (
                    <HelpRequestRow
                      key={r.id}
                      r={r}
                      now={now}
                      serviceName={serviceName(r.service_id)}
                      showDepartment={!dept}
                      selected={selected.has(r.id)}
                      onSelect={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; })}
                      right={<RequestActions r={r} compact onChange={(id, p) => patch(id, p)} />}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === "board" && manager && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="!w-auto" />
              <span className="text-xs text-muted">Drag a card to change its status. Accepting an unowned request makes you the owner.</span>
            </div>
            <HelpBoard rows={rows.filter((r) => !dept || r.department_id === dept)} now={now} onMove={move} canMove />
          </div>
        )}

        {tab === "catalog" && manageable.length > 0 && <CatalogManager services={data.services} manageableDepartmentIds={manageable} />}
      </div>

      {isInternal(profile.role) && <IncidentsList />}
    </div>
  );
}

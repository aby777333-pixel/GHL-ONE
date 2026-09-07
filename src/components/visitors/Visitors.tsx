"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, LogIn, LogOut, Plus, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, fmtDate, fmtTime, type Tables } from "@/lib/utils";
import { useTouchModule } from "@/components/intel/lib";

export type VisitorRow = Tables<"visitors">;
const TONE: Record<string, string> = { expected: "tone-info", arrived: "tone-success", left: "tone-muted", cancelled: "tone-muted" };

/** Expected visitors: hosts register; front desk (Admin dept / HR) marks arrivals and departures. */
export function Visitors({ rows }: { rows: VisitorRow[] }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  useTouchModule("visitors");
  useSeen("nav:/visitors");
  const [tab, setTab] = React.useState<"today" | "upcoming" | "past">("today");
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [today] = React.useState(() => new Date().toDateString());

  const isToday = (v: VisitorRow) => new Date(v.expected_at).toDateString() === today;
  const list = rows.filter((v) => tab === "today" ? isToday(v) : tab === "upcoming" ? !isToday(v) && v.status === "expected" && new Date(v.expected_at).getTime() > Date.parse(today) : !isToday(v) && (v.status !== "expected" || new Date(v.expected_at).getTime() < Date.parse(today))).sort((a, b) => a.expected_at.localeCompare(b.expected_at));

  async function set(v: VisitorRow, status: "arrived" | "left" | "cancelled") {
    setBusy(v.id);
    const patch: Partial<VisitorRow> = { status };
    if (status === "arrived") patch.arrived_at = new Date().toISOString();
    if (status === "left") patch.left_at = new Date().toISOString();
    const { error } = await createClient().from("visitors").update(patch).eq("id", v.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(status === "arrived" ? `${v.name} has arrived — host notified` : status === "left" ? `${v.name} signed out` : "Visit cancelled", status === "cancelled" ? "info" : "success");
    if (status === "arrived" && v.host_id !== profile.id) {
      const sb = createClient();
      const { data: dm } = await sb.rpc("open_dm", { other: v.host_id });
      if (dm) await sb.from("messages").insert({ channel_id: dm, author_id: profile.id, body: `Your visitor ${v.name}${v.company ? ` (${v.company})` : ""} has arrived at reception.` });
    }
    router.refresh();
  }

  const tabs = [
    { key: "today" as const, label: "Today", count: rows.filter(isToday).length || undefined },
    { key: "upcoming" as const, label: "Upcoming", count: rows.filter((v) => !isToday(v) && v.status === "expected" && new Date(v.expected_at).getTime() > Date.parse(today)).length || undefined },
    { key: "past" as const, label: "Past" },
  ];

  return (
    <div className="page page-narrow">
      <PageHeader eyebrow="Office" title="Visitors" subtitle="Register who is coming so reception knows, and the host hears the moment they arrive." actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={15} /> Expect a visitor</Button>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-3" />
      <Card>
        {list.length === 0 ? <EmptyState icon={<DoorOpen size={18} />} title={tab === "today" ? "No visitors expected today" : tab === "upcoming" ? "Nothing scheduled" : "No past visits"} action={tab !== "past" ? <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus size={14} /> Expect a visitor</Button> : undefined} /> : (
          <div className="divide-y">
            {list.map((v) => (
              <div key={v.id} className={cn("px-[var(--s4)] py-3 flex items-start gap-3", v.status === "cancelled" && "opacity-60")}>
                <span className={cn("mt-0.5 w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0", TONE[v.status])}><UserRound size={14} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium">{v.name}</span>{v.company && <span className="text-xs text-muted">{v.company}</span>}<Pill tone={TONE[v.status] || "tone-neutral"} className="capitalize">{v.status}</Pill></div>
                  <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap"><span className="num">{fmtDate(v.expected_at)} · {fmtTime(v.expected_at)}</span><span className="inline-flex items-center gap-1">· host <PersonChip id={v.host_id} size={14} /><Blink zone={`user:${v.host_id}`} /></span>{v.phone && <span>· {v.phone}</span>}{v.arrived_at && <span>· arrived {ago(v.arrived_at)}</span>}{v.left_at && <span>· left {fmtTime(v.left_at)}</span>}</div>
                  {v.purpose && <div className="text-xs text-2 mt-1">{v.purpose}</div>}
                </div>
                <span className="flex items-center gap-1 shrink-0">
                  {v.status === "expected" && <Button size="xs" variant="success" loading={busy === v.id} onClick={() => set(v, "arrived")}><LogIn size={12} /> Arrived</Button>}
                  {v.status === "arrived" && <Button size="xs" variant="secondary" loading={busy === v.id} onClick={() => set(v, "left")}><LogOut size={12} /> Left</Button>}
                  {v.status === "expected" && <Button size="xs" variant="ghost" disabled={busy === v.id} onClick={() => set(v, "cancelled")} aria-label="Cancel"><X size={12} /></Button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="Expect a visitor" width={520}><VisitorForm onDone={() => { setAdding(false); router.refresh(); }} onCancel={() => setAdding(false)} /></Modal>
    </div>
  );
}

function VisitorForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [host, setHost] = React.useState(profile.id);
  const [when, setWhen] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !when) return;
    setBusy(true);
    const { error } = await createClient().from("visitors").insert({ org_id: profile.org_id!, host_id: host || profile.id, name: name.trim(), company: company.trim() || null, phone: phone.trim() || null, purpose: purpose.trim() || null, expected_at: new Date(when).toISOString() });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Visitor registered", "success"); onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Visitor name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Company"><Input value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Expected at"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required /></Field>
        <Field label="Host" className="sm:col-span-2"><PersonPicker value={host} onChange={setHost} allowEmpty={false} /></Field>
      </div>
      <Field label="Purpose"><Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ minHeight: 48 }} placeholder="Interview, vendor demo, client meeting…" /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Register</Button></div>
    </form>
  );
}

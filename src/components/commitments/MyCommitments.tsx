"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Handshake, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Pill, Skeleton, Tabs, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, relDate } from "@/lib/utils";
import { jsonArr, jsonObj, num, str } from "@/components/intel/lib";

export type Commitment = { id: string; text: string; due_at: string | null; status: string; promised_by: string; promised_to_user: string | null; to_name: string | null; by_name: string | null; source_link: string | null; task_id: string | null; created_at: string };
type Data = { iPromised: Commitment[]; promisedToMe: Commitment[]; dueToday: number; overdue: number; completed30d: number };

function parse(j: Parameters<typeof jsonObj>[0]): Data {
  const o = jsonObj(j);
  const row = (x: Record<string, unknown>): Commitment => ({ id: str(x.id as string), text: str(x.text as string), due_at: typeof x.due_at === "string" ? x.due_at : null, status: str(x.status as string, "open"), promised_by: str(x.promised_by as string), promised_to_user: typeof x.promised_to_user === "string" ? x.promised_to_user : null, to_name: typeof x.to_name === "string" ? x.to_name : null, by_name: typeof x.by_name === "string" ? x.by_name : null, source_link: typeof x.source_link === "string" ? x.source_link : null, task_id: typeof x.task_id === "string" ? x.task_id : null, created_at: str(x.created_at as string) });
  return { iPromised: jsonArr(o.i_promised).map(row), promisedToMe: jsonArr(o.promised_to_me).map(row), dueToday: num(o.due_today), overdue: num(o.overdue), completed30d: num(o.completed_30d) };
}

/** Promise tracker: what I said I'd do, what others promised me. Powered by `my_commitments()`. */
export function MyCommitments({ compact }: { compact?: boolean }) {
  const { profile } = useSession();
  const toast = useToast();
  const [data, setData] = React.useState<Data | null>(null);
  const [tab, setTab] = React.useState<"mine" | "tome">("mine");
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const [now] = React.useState(() => Date.now());

  React.useEffect(() => {
    let alive = true;
    createClient().rpc("my_commitments").then(({ data: d }) => { if (alive) setData(parse(d)); });
    return () => { alive = false; };
  }, [tick]);

  async function setStatus(c: Commitment, status: "done" | "missed" | "cancelled" | "open") {
    setBusy(c.id);
    const { error } = await createClient().from("commitments").update({ status, done_at: status === "done" ? new Date().toISOString() : null }).eq("id", c.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(status === "done" ? "Marked as kept" : status === "open" ? "Reopened" : `Marked ${status}`, status === "done" ? "success" : "info");
    setTick((t) => t + 1);
  }

  const list = data ? (tab === "mine" ? data.iPromised : data.promisedToMe) : [];
  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Handshake size={15} /> Commitments</span>}
        subtitle={data ? `${data.overdue ? `${data.overdue} overdue · ` : ""}${data.dueToday} due today · ${data.completed30d} kept in 30 days` : "Promises you made and promises made to you"}
        action={<Button size="sm" variant={adding ? "secondary" : "primary"} onClick={() => setAdding((a) => !a)}>{adding ? <X size={13} /> : <Plus size={13} />} {adding ? "Close" : "I promise…"}</Button>}
      />
      {adding && <PromiseForm onDone={() => { setAdding(false); setTick((t) => t + 1); }} />}
      <Tabs tabs={[{ key: "mine" as const, label: "I promised", count: data?.iPromised.length }, { key: "tome" as const, label: "Promised to me", count: data?.promisedToMe.length }]} value={tab} onChange={setTab} className="px-[var(--s3)]" />
      {!data ? <div className="p-[var(--s3)] space-y-2"><Skeleton /><Skeleton /></div> : list.length === 0 ? (
        <EmptyState title={tab === "mine" ? "No open promises" : "Nobody owes you anything right now"} hint={tab === "mine" ? "When you say “I'll send it by Friday” — record it here or from a chat message, and GHL ONE reminds you." : undefined} className="py-[var(--s4)]" />
      ) : (
        <div className="divide-y">
          {(compact ? list.slice(0, 6) : list).map((c) => {
            const late = c.status === "missed" || (c.due_at && new Date(c.due_at).getTime() < now);
            return (
              <div key={c.id} className="px-[var(--s4)] py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{c.text}</div>
                  <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                    {tab === "mine" ? <span>to {c.promised_to_user ? <PersonChip id={c.promised_to_user} size={14} /> : c.to_name || "someone"}</span> : <span>by <PersonChip id={c.promised_by} size={14} /></span>}
                    {c.due_at && <span className={cn("num", late && "text-danger font-medium")}>· due {relDate(c.due_at)} ({fmtDate(c.due_at, true)})</span>}
                    {c.status === "missed" && <Pill tone="tone-danger">Missed</Pill>}
                    {c.task_id && <Link href={`/tasks/${c.task_id}`} className="hover:underline">· task</Link>}
                    {c.source_link && !c.task_id && <Link href={c.source_link} className="hover:underline">· source</Link>}
                    <span>· {ago(c.created_at)}</span>
                  </div>
                </div>
                {(tab === "mine" || c.promised_to_user === profile.id) && (
                  <span className="flex items-center gap-1 shrink-0">
                    <Button size="xs" variant="success" loading={busy === c.id} onClick={() => setStatus(c, "done")} title="Kept"><Check size={12} /> Kept</Button>
                    {tab === "mine" && c.status !== "missed" && <Button size="xs" variant="ghost" disabled={busy === c.id} onClick={() => setStatus(c, "cancelled")} title="Cancel this promise"><X size={12} /></Button>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** "I promise…" quick add. */
export function PromiseForm({ onDone, defaults }: { onDone: () => void; defaults?: { to?: string | null; text?: string; source_type?: string; source_id?: string; source_link?: string; task_id?: string } }) {
  const { profile } = useSession();
  const toast = useToast();
  const [text, setText] = React.useState(defaults?.text || "");
  const [to, setTo] = React.useState(defaults?.to || "");
  const [toLabel, setToLabel] = React.useState("");
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 3) return;
    setBusy(true);
    const { error } = await createClient().from("commitments").insert({ org_id: profile.org_id!, promised_by: profile.id, promised_to_user: to || null, promised_to_label: !to && toLabel.trim() ? toLabel.trim() : null, text: text.trim(), due_at: due ? new Date(due).toISOString() : null, source_type: defaults?.source_type || "manual", source_id: defaults?.source_id || null, source_link: defaults?.source_link || null, task_id: defaults?.task_id || null });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Promise recorded — you will be reminded", "success");
    setText(""); setDue(""); onDone();
  }
  return (
    <form onSubmit={submit} className="px-[var(--s4)] pb-3 space-y-2">
      <Field label="I promise to…"><Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="send the revised deck" required /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="To"><PersonPicker value={to} onChange={setTo} placeholder="Someone outside / unspecified" /></Field>
        {!to && <Field label="Or a name"><Input value={toLabel} onChange={(e) => setToLabel(e.target.value)} placeholder="e.g. client — Mr Rao" /></Field>}
        <Field label="By"><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end"><Button type="submit" size="sm" variant="primary" loading={busy} disabled={text.trim().length < 3}><Handshake size={13} /> Record promise</Button></div>
    </form>
  );
}

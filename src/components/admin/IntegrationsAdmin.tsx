"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plug, Plus, Pencil, Trash2, Hash, Webhook, ArrowDownToLine, Copy, RefreshCw, Eye, EyeOff, CalendarDays, GitBranch, MessageCircle, Video, PenTool, Palette, HardDrive, ChevronDown, ChevronRight, Info, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Spinner, useToast } from "@/components/ui";
import { PersonPicker, DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, PRIORITIES, PRIORITY_LABEL, type Tables } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { Toggle } from "@/components/automations/AutomationBits";

type Integration = Tables<"integrations">;
type Delivery = Tables<"integration_deliveries">;
type ChannelLite = { id: string; name: string; slug: string | null; type: string };
type Cfg = Record<string, string>;

function readCfg(j: Json): Cfg {
  if (!j || typeof j !== "object" || Array.isArray(j)) return {};
  const out: Cfg = {};
  for (const [k, v] of Object.entries(j)) if (v != null && typeof v !== "object") out[k] = String(v);
  return out;
}
function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function useOrigin() {
  return React.useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
}
function useCopy() {
  const toast = useToast();
  return React.useCallback((text: string, label = "Copied") => {
    navigator.clipboard?.writeText(text).then(() => toast.push(label, "success"), () => toast.push("Could not copy", "danger"));
  }, [toast]);
}

type Provider = "slack" | "webhook_out" | "webhook_in";

export function IntegrationsAdmin({ integrations, channels }: { integrations: Integration[]; channels: ChannelLite[] }) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = React.useState<{ provider: Provider; row: Integration | null } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const by = (p: string) => integrations.filter((i) => i.provider === p);

  async function toggle(i: Integration, enabled: boolean) {
    setBusy(i.id);
    const { error } = await createClient().from("integrations").update({ enabled }).eq("id", i.id);
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    router.refresh();
  }
  async function remove(i: Integration) {
    if (!confirm(`Delete “${i.name}”? Automations using it will skip this step.`)) return;
    setBusy(i.id);
    const { error } = await createClient().from("integrations").delete().eq("id", i.id);
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Integration deleted", "success");
    router.refresh();
  }

  const common = { busy, onToggle: toggle, onRemove: remove, onEdit: (row: Integration) => setEdit({ provider: row.provider as Provider, row }) };

  return (
    <div className="space-y-[var(--s4)]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s4)]">
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Hash size={16} /> Slack</span>} subtitle="Post automation messages into a Slack channel via an incoming webhook." action={<Button size="sm" variant="primary" onClick={() => setEdit({ provider: "slack", row: null })}><Plus size={14} /> Add</Button>} />
          <IntegrationList rows={by("slack")} empty="No Slack workspaces connected." {...common} render={(i) => <div className="text-[11px] text-muted font-mono truncate">{maskUrl(readCfg(i.config).url)}</div>} />
          <div className="px-[var(--s4)] pb-[var(--s3)] text-[11px] text-muted space-y-1.5">
            <div className="flex items-start gap-2"><Info size={13} className="shrink-0 mt-0.5" /><span>In Slack: <em>Apps → Incoming Webhooks → Add to channel</em>, then paste the URL here. To test it, create an automation with the action “Send to Slack”.</span></div>
            <Link href="/automations?template=slack" className="btn btn-secondary btn-xs"><Workflow size={12} /> Copy sample automation</Link>
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Webhook size={16} /> Outgoing webhooks</span>} subtitle="Signed JSON POSTs from the automation action “Call a webhook”." action={<Button size="sm" variant="primary" onClick={() => setEdit({ provider: "webhook_out", row: null })}><Plus size={14} /> Add</Button>} />
          <IntegrationList rows={by("webhook_out")} empty="No outgoing webhooks yet." {...common} render={(i) => <OutgoingDetails row={i} />} />
          <div className="px-[var(--s4)] pb-[var(--s3)] text-[11px] text-muted flex items-start gap-2"><Info size={13} className="shrink-0 mt-0.5" /><span>Every request carries <code className="font-mono">X-GHL-Event</code> and <code className="font-mono">X-GHL-Signature</code> (HMAC-SHA256 of the body with your secret). Verify it before trusting the payload.</span></div>
        </Card>
      </div>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><ArrowDownToLine size={16} /> Incoming webhooks</span>} subtitle="Give other tools a URL. Anything POSTed becomes a task or a chat message." action={<Button size="sm" variant="primary" onClick={() => setEdit({ provider: "webhook_in", row: null })}><Plus size={14} /> Add</Button>} />
        <IntegrationList rows={by("webhook_in")} empty="No incoming webhooks yet. Create one for GitHub, a form builder, Zapier or a WhatsApp bridge." {...common} render={(i) => <IncomingDetails row={i} channels={channels} />} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s4)]">
        <CalendarCard />
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Plug size={16} /> More connectors</span>} subtitle="Available today through incoming webhooks or Zapier / Make. Native OAuth connectors are on the roadmap." />
          <div className="px-[var(--s4)] pb-[var(--s4)] grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { icon: <GitBranch size={15} />, name: "GitHub", how: "Issues & PRs → tasks via incoming webhook" },
              { icon: <MessageCircle size={15} />, name: "WhatsApp", how: "Bridge (Twilio / 360dialog) → incoming webhook" },
              { icon: <Video size={15} />, name: "Zoom", how: "Meeting links in Meetings; recordings via webhook" },
              { icon: <PenTool size={15} />, name: "Figma", how: "Share links in Files; comments via Zapier" },
              { icon: <Palette size={15} />, name: "Canva", how: "Share links in Files" },
              { icon: <HardDrive size={15} />, name: "Google Drive", how: "Link files; sync via Zapier / Make" },
            ].map((c) => (
              <div key={c.name} className="sunken rounded-[var(--radius-sm)] p-2.5 min-w-0">
                <div className="inline-flex items-center gap-1.5 text-sm font-medium">{c.icon} {c.name}</div>
                <div className="text-[11px] text-muted mt-0.5 leading-snug">{c.how}</div>
                <Pill tone="tone-muted" className="mt-1.5">roadmap</Pill>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {edit && <IntegrationEditor provider={edit.provider} row={edit.row} channels={channels} onClose={() => setEdit(null)} />}
    </div>
  );
}

function maskUrl(u?: string) {
  if (!u) return "—";
  try {
    const url = new URL(u);
    const path = url.pathname.length > 18 ? url.pathname.slice(0, 12) + "…" + url.pathname.slice(-4) : url.pathname;
    return url.host + path;
  } catch {
    return u.slice(0, 40);
  }
}

function IntegrationList({ rows, empty, busy, onToggle, onRemove, onEdit, render }: { rows: Integration[]; empty: string; busy: string | null; onToggle: (i: Integration, v: boolean) => void; onRemove: (i: Integration) => void; onEdit: (i: Integration) => void; render: (i: Integration) => React.ReactNode }) {
  if (rows.length === 0) return <div className="px-[var(--s4)] pb-[var(--s3)] text-sm text-muted">{empty}</div>;
  return (
    <div className="divide-y border-t">
      {rows.map((i) => (
        <div key={i.id} className={cn("px-[var(--s3)] sm:px-[var(--s4)] py-2.5", busy === i.id && "opacity-50", !i.enabled && "opacity-70")}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium truncate">{i.name}</span>
              <span className="block text-[11px] text-muted">{i.last_used_at ? `last used ${ago(i.last_used_at)}` : "never used"} · added {fmtDate(i.created_at)}</span>
            </span>
            <Toggle on={i.enabled} onChange={(v) => onToggle(i, v)} size="sm" disabled={!!busy} />
            <Button variant="ghost" size="sm" icon onClick={() => onEdit(i)} aria-label="Edit"><Pencil size={14} /></Button>
            <Button variant="ghost" size="sm" icon onClick={() => onRemove(i)} aria-label="Delete" className="text-danger"><Trash2 size={14} /></Button>
          </div>
          <div className="mt-1.5">{render(i)}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ outgoing */
function OutgoingDetails({ row }: { row: Integration }) {
  const cfg = readCfg(row.config);
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-muted font-mono truncate">{maskUrl(cfg.url)}</div>
      <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted" onClick={() => setOpen((o) => !o)}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Recent deliveries</button>
      {open && <Deliveries integrationId={row.id} />}
    </div>
  );
}

function Deliveries({ integrationId }: { integrationId: string }) {
  const [data, setData] = React.useState<{ id: string; rows: Delivery[] } | null>(null);
  const [show, setShow] = React.useState<Record<number, boolean>>({});
  const loading = !data || data.id !== integrationId;
  React.useEffect(() => {
    let alive = true;
    createClient().from("integration_deliveries").select("*").eq("integration_id", integrationId).order("created_at", { ascending: false }).limit(20).then(({ data: rows }) => alive && setData({ id: integrationId, rows: rows || [] }));
    return () => { alive = false; };
  }, [integrationId]);
  if (loading) return <div className="py-2"><Spinner /></div>;
  if (data.rows.length === 0) return <div className="text-[11px] text-muted">No deliveries yet.</div>;
  return (
    <div className="divide-y sunken rounded-[var(--radius-sm)]">
      {data.rows.map((d) => (
        <div key={d.id} className="px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <Pill tone={d.status === "sent" || d.status === "received" ? "tone-success" : d.status === "queued" ? "tone-warn" : "tone-danger"}>{d.status}</Pill>
            <span className="font-mono text-muted truncate">{d.event}</span>
            <button type="button" className="link ml-auto shrink-0" onClick={() => setShow((s) => ({ ...s, [d.id]: !s[d.id] }))}>{show[d.id] ? "hide" : "payload"}</button>
            <span className="text-muted num shrink-0" title={fmtDate(d.created_at, true)}>{ago(d.created_at)}</span>
          </div>
          {d.error && <div className="text-danger mt-0.5 break-words">{d.error}</div>}
          {show[d.id] && <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-all max-h-[160px] overflow-y-auto">{JSON.stringify(d.payload, null, 2)}</pre>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ incoming */
function IncomingDetails({ row, channels }: { row: Integration; channels: ChannelLite[] }) {
  const cfg = readCfg(row.config);
  const origin = useOrigin();
  const copy = useCopy();
  const { departments, people } = useSession();
  const url = `${origin || ""}/api/hooks/${cfg.token || ""}`;
  const curl = `curl -X POST ${url} -H "Content-Type: application/json" -d '{"title":"New request from the website","description":"Details go here"}'`;
  const target = cfg.target === "message" ? `message → #${channels.find((c) => c.id === cfg.channel_id)?.slug || channels.find((c) => c.id === cfg.channel_id)?.name || "?"}` : "task";
  const extras = [
    cfg.department_id && departments.find((d) => d.id === cfg.department_id)?.name,
    cfg.assignee_id && people.find((p) => p.id === cfg.assignee_id)?.full_name,
    cfg.priority && PRIORITY_LABEL[cfg.priority as keyof typeof PRIORITY_LABEL],
  ].filter(Boolean);
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <Pill tone="tone-info">creates {target}</Pill>
        {extras.map((e) => <Pill key={String(e)} tone="tone-neutral">{e}</Pill>)}
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <code className="text-[11px] font-mono truncate flex-1 sunken rounded px-2 py-1">{url}</code>
        <Button size="xs" variant="ghost" icon onClick={() => copy(url, "URL copied")} aria-label="Copy URL"><Copy size={12} /></Button>
      </div>
      <details className="text-[11px]">
        <summary className="cursor-pointer text-muted">Sample request</summary>
        <div className="flex items-start gap-1 mt-1 min-w-0">
          <pre className="font-mono whitespace-pre-wrap break-all flex-1 sunken rounded px-2 py-1">{curl}</pre>
          <Button size="xs" variant="ghost" icon onClick={() => copy(curl, "curl copied")} aria-label="Copy curl"><Copy size={12} /></Button>
        </div>
        <div className="text-muted mt-1">GitHub issue / pull-request payloads and form posts (<code className="font-mono">title</code>, <code className="font-mono">subject</code>, <code className="font-mono">text</code>, <code className="font-mono">body</code>, <code className="font-mono">message</code>) are understood automatically.</div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------ calendar */
function CalendarCard() {
  const { profile } = useSession();
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><CalendarDays size={16} /> Google Calendar · Outlook · Apple</span>} subtitle="Personal calendar feeds — no admin setup needed." />
      <div className="px-[var(--s4)] pb-[var(--s4)] text-sm space-y-2">
        <p className="text-muted">Every person has a private iCal feed with their meetings, events and task deadlines. They subscribe to it once from their profile and it stays in sync in Google Calendar, Outlook or Apple Calendar.</p>
        <Link href={`/people/${profile.id}?edit=1#calendar`} className="btn btn-secondary btn-sm"><CalendarDays size={14} /> My calendar feed</Link>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------- editor */
function IntegrationEditor({ provider, row, channels, onClose }: { provider: Provider; row: Integration | null; channels: ChannelLite[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const copy = useCopy();
  const origin = useOrigin();
  const { profile } = useSession();
  const base = React.useMemo(() => readCfg(row?.config ?? {}), [row]);
  const [name, setName] = React.useState(row?.name || (provider === "slack" ? "Slack — #general" : provider === "webhook_out" ? "Outgoing webhook" : "Incoming webhook"));
  const [url, setUrl] = React.useState(base.url || "");
  const [secret, setSecret] = React.useState(base.secret || (provider === "webhook_out" ? randomHex() : ""));
  const [secretFresh, setSecretFresh] = React.useState(!row);
  const [reveal, setReveal] = React.useState(false);
  const [token, setToken] = React.useState(base.token || (provider === "webhook_in" ? randomToken() : ""));
  const [target, setTarget] = React.useState(base.target || "task");
  const [departmentId, setDepartmentId] = React.useState(base.department_id || "");
  const [projectId, setProjectId] = React.useState(base.project_id || "");
  const [assigneeId, setAssigneeId] = React.useState(base.assignee_id || "");
  const [priority, setPriority] = React.useState(base.priority || "normal");
  const [channelId, setChannelId] = React.useState(base.channel_id || "");
  const [enabled, setEnabled] = React.useState(row?.enabled ?? true);
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.push("Name it", "danger"); return; }
    let config: Cfg = {};
    if (provider === "slack") {
      if (!/^https:\/\/hooks\.slack\.com\//.test(url.trim())) { toast.push("Paste a Slack incoming-webhook URL (https://hooks.slack.com/…)", "danger"); return; }
      config = { url: url.trim() };
    } else if (provider === "webhook_out") {
      if (!/^https?:\/\//.test(url.trim())) { toast.push("Enter a valid URL", "danger"); return; }
      config = { url: url.trim(), secret };
    } else {
      if (target === "message" && !channelId) { toast.push("Choose a channel for messages", "danger"); return; }
      config = { token, target, department_id: departmentId, project_id: projectId, assignee_id: assigneeId, priority, channel_id: target === "message" ? channelId : "" };
      for (const k of Object.keys(config)) if (!config[k]) delete config[k];
    }
    setBusy(true);
    const sb = createClient();
    const { error } = row
      ? await sb.from("integrations").update({ name: name.trim(), config: config as Json, enabled }).eq("id", row.id)
      : await sb.from("integrations").insert({ org_id: profile.org_id!, provider, name: name.trim(), config: config as Json, enabled, created_by: profile.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(row ? "Integration updated" : "Integration added", "success");
    onClose();
    router.refresh();
  }

  const title = provider === "slack" ? "Slack incoming webhook" : provider === "webhook_out" ? "Outgoing webhook" : "Incoming webhook";
  const hookUrl = `${origin || ""}/api/hooks/${token}`;

  return (
    <Modal open onClose={onClose} title={`${row ? "Edit" : "Add"} ${title}`} width={580} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>{row ? "Save" : "Add"}</Button></>}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>

        {provider === "slack" && (
          <Field label="Incoming webhook URL" hint="Slack → Apps → Incoming Webhooks → Add to channel."><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/T…/B…/…" type="url" required /></Field>
        )}

        {provider === "webhook_out" && (
          <>
            <Field label="URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/ghl-hook" type="url" required /></Field>
            <Field label="Signing secret" hint={secretFresh ? "Shown once — copy it into the receiving system now." : "Hidden. Regenerate if it leaked; update the receiving system afterwards."}>
              <div className="flex items-center gap-1">
                <Input readOnly value={secretFresh || reveal ? secret : "•".repeat(24)} className="font-mono text-xs flex-1" />
                {!secretFresh && <Button type="button" size="sm" variant="ghost" icon onClick={() => setReveal((r) => !r)} aria-label="Reveal">{reveal ? <EyeOff size={14} /> : <Eye size={14} />}</Button>}
                <Button type="button" size="sm" variant="ghost" icon onClick={() => copy(secret, "Secret copied")} aria-label="Copy"><Copy size={14} /></Button>
                <Button type="button" size="sm" variant="ghost" icon onClick={() => { setSecret(randomHex()); setSecretFresh(true); }} aria-label="Regenerate"><RefreshCw size={14} /></Button>
              </div>
            </Field>
            <div className="text-[11px] text-muted">Used by the automation action “Call a webhook”. Events sent: whichever trigger the automation listens to.</div>
          </>
        )}

        {provider === "webhook_in" && (
          <>
            <Field label="Webhook URL" hint="POST JSON here. Anyone with the URL can create records — treat it like a password.">
              <div className="flex items-center gap-1 min-w-0">
                <Input readOnly value={hookUrl} className="font-mono text-xs flex-1 min-w-0" />
                <Button type="button" size="sm" variant="ghost" icon onClick={() => copy(hookUrl, "URL copied")} aria-label="Copy"><Copy size={14} /></Button>
                <Button type="button" size="sm" variant="ghost" icon onClick={() => { if (!row || confirm("Regenerate the token? The old URL stops working immediately.")) setToken(randomToken()); }} aria-label="Regenerate"><RefreshCw size={14} /></Button>
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Create a">
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="task">Task</option>
                  <option value="message">Chat message</option>
                </Select>
              </Field>
              {target === "message" ? (
                <Field label="Channel">
                  <Select value={channelId} onChange={(e) => setChannelId(e.target.value)} required>
                    <option value="">Choose channel…</option>
                    {channels.map((c) => <option key={c.id} value={c.id}>#{c.slug || c.name} · {c.type}</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label="Priority">
                  <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </Select>
                </Field>
              )}
            </div>
            {target === "task" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Department"><DepartmentPicker value={departmentId} onChange={setDepartmentId} /></Field>
                <Field label="Project"><ProjectPicker value={projectId} onChange={setProjectId} /></Field>
                <Field label="Assignee"><PersonPicker value={assigneeId} onChange={setAssigneeId} /></Field>
              </div>
            )}
            <div className="text-[11px] text-muted">Understands GitHub issue / PR payloads, plain <code className="font-mono">{"{title, description}"}</code>, form posts and raw text.</div>
          </>
        )}

        <Toggle on={enabled} onChange={setEnabled} label="Enabled" />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

"use client";

import * as React from "react";
import { Megaphone, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, Modal, Pill, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";
import { canPublishAnnouncement, rpcError } from "./lib";

type Announcement = {
  id: string;
  title: string;
  body: string;
  severity: string;
  audience: string;
  target_orgs: string[];
  publish_at: string;
  expires_at: string | null;
  created_at: string;
};

const SEVERITY: { key: string; label: string; tone: string }[] = [
  { key: "info", label: "Information", tone: "tone-info" },
  { key: "feature", label: "New feature", tone: "tone-violet" },
  { key: "maintenance", label: "Maintenance", tone: "tone-warn" },
  { key: "incident", label: "Incident", tone: "tone-orange" },
  { key: "security", label: "Security", tone: "tone-danger" },
];
const SEVERITY_TONE: Record<string, string> = Object.fromEntries(SEVERITY.map((s) => [s.key, s.tone]));

const AUDIENCE: { key: string; label: string; hint: string }[] = [
  { key: "all", label: "Everyone in every company", hint: "Every active person on the platform." },
  { key: "admins_only", label: "Company administrators only", hint: "Super admins and directors." },
  { key: "selected", label: "Selected companies", hint: "Only the companies you tick." },
];

/** Platform-wide notices (§80-82). Writing one is not sending it — publishing is a separate, audited act. */
/** Plain fetch helper — no state, so the mount effect can apply the result from a promise callback. */
async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data } = await createClient().from("platform_announcements").select("*").order("created_at", { ascending: false }).limit(50);
  return (data || []) as Announcement[];
}

export function PlatformAnnouncements({ companies, platformRole }: { companies: { org_id: string; name: string }[]; platformRole: string | null }) {
  const toast = useToast();
  const [rows, setRows] = React.useState<Announcement[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const canPublish = canPublishAnnouncement(platformRole);

  const [form, setForm] = React.useState({ title: "", body: "", severity: "info", audience: "all", target_orgs: [] as string[], expires_at: "" });

  const load = React.useCallback(async () => {
    setRows(await fetchAnnouncements());
  }, []);

  React.useEffect(() => {
    let alive = true;
    void fetchAnnouncements().then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function create() {
    if (form.title.trim().length < 3 || form.body.trim().length < 10) return;
    setBusy("new");
    const { error } = await createClient()
      .from("platform_announcements")
      .insert({
        title: form.title.trim(),
        body: form.body.trim(),
        severity: form.severity,
        audience: form.audience,
        target_orgs: form.audience === "selected" ? form.target_orgs : [],
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      });
    setBusy(null);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    setOpen(false);
    setForm({ title: "", body: "", severity: "info", audience: "all", target_orgs: [], expires_at: "" });
    toast.push("Draft saved — publish it when you are ready", "success");
    load();
  }

  async function publish(a: Announcement) {
    setBusy(a.id);
    const { data, error } = await createClient().rpc("publish_platform_announcement", { p_id: a.id });
    setBusy(null);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    toast.push(`Delivered to ${Number(data || 0).toLocaleString()} people`, "success");
    load();
  }

  async function remove(a: Announcement) {
    setBusy(a.id);
    const { error } = await createClient().from("platform_announcements").delete().eq("id", a.id);
    setBusy(null);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    setRows((r) => (r || []).filter((x) => x.id !== a.id));
  }

  const toggleOrg = (id: string) =>
    setForm((f) => ({ ...f, target_orgs: f.target_orgs.includes(id) ? f.target_orgs.filter((x) => x !== id) : [...f.target_orgs, id] }));

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow">Announcements</div>
          <div className="text-[11px] text-muted mt-0.5">Maintenance windows, incidents and new features. Delivered as a notification inside each company.</div>
        </div>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          <Megaphone size={14} /> New announcement
        </Button>
      </div>

      {rows === null ? (
        <div className="card p-[var(--s4)] flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone size={20} />} title="No announcements yet" hint="Write one before your next maintenance window so every company hears it from you first." />
        </Card>
      ) : (
        <div className="space-y-[var(--s2)]">
          {rows.map((a) => (
            <Card key={a.id} className="p-[var(--s3)] min-w-0">
              <div className="flex items-start gap-2 flex-wrap">
                <Pill tone={SEVERITY_TONE[a.severity] || "tone-neutral"}>{SEVERITY.find((s) => s.key === a.severity)?.label || a.severity}</Pill>
                <span className="text-sm font-semibold min-w-0 flex-1 truncate">{a.title}</span>
                <span className="text-[11px] text-muted shrink-0">{fmtDate(a.created_at)}</span>
              </div>
              <p className="text-[12px] text-2 mt-1.5 whitespace-pre-wrap">{a.body}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2.5 border-t">
                <span className="text-[11px] text-muted">
                  {AUDIENCE.find((x) => x.key === a.audience)?.label}
                  {a.audience === "selected" ? ` · ${a.target_orgs.length} companies` : ""}
                  {a.expires_at ? ` · expires ${fmtDate(a.expires_at)}` : ""}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <Button size="xs" variant="ghost" onClick={() => remove(a)} disabled={busy === a.id}>
                    <Trash2 size={13} /> Delete
                  </Button>
                  {canPublish && (
                    <Button size="xs" variant="primary" loading={busy === a.id} onClick={() => publish(a)}>
                      <Send size={13} /> Publish
                    </Button>
                  )}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New platform announcement"
        width={600}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy === "new"} disabled={form.title.trim().length < 3 || form.body.trim().length < 10} onClick={create}>
              Save draft
            </Button>
          </>
        }
      >
        <div className="space-y-[var(--s3)]">
          <Field label="Title">
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Planned maintenance — Sunday 02:00 to 04:00 IST" />
          </Field>
          <Field label="Message" hint="Written for an employee, not an engineer. Say what changes for them.">
            <Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} className="min-h-[100px]" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s3)]">
            <Field label="Kind">
              <Select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                {SEVERITY.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expires (optional)">
              <Input type="date" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} />
            </Field>
          </div>
          <Field label="Who sees it" hint={AUDIENCE.find((a) => a.key === form.audience)?.hint}>
            <Select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
              {AUDIENCE.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
          {form.audience === "selected" && (
            <div className="flex flex-wrap gap-1.5">
              {companies.map((c) => (
                <button
                  key={c.org_id}
                  type="button"
                  onClick={() => toggleOrg(c.org_id)}
                  className={cn("pill pill-lg", form.target_orgs.includes(c.org_id) ? "tone-brand" : "tone-neutral hover:bg-[var(--line)]")}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

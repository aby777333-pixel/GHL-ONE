"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Megaphone, Send, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PeopleMultiSelect } from "@/components/meetings/PeopleMultiSelect";
import { Switch } from "@/components/admin/AdminBits";
import { cn, ROLE_LABEL, ROLE_RANK, type RoleLevel } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { BROADCAST_KINDS, BROADCAST_KIND_LABEL, friendlyError, useTouchModule } from "@/components/intel/lib";

type AudienceMode = "all" | "departments" | "teams" | "roles" | "people";

/** Compose a broadcast. The DB trigger enforces `broadcast_company` / `broadcast_department` and fans out critical notifications. */
export function NewBroadcast({ canCompany, canDepartment, teams }: { canCompany: boolean; canDepartment: boolean; teams: { id: string; name: string; department_id: string }[] }) {
  const { profile, departments, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  useTouchModule("broadcasts");
  const [mode, setMode] = React.useState<AudienceMode>(canCompany ? "all" : "departments");
  const [kind, setKind] = React.useState<string>("urgent");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [deptIds, setDeptIds] = React.useState<string[]>(profile.department_id ? [profile.department_id] : []);
  const [teamIds, setTeamIds] = React.useState<string[]>([]);
  const [roles, setRoles] = React.useState<string[]>([]);
  const [userIds, setUserIds] = React.useState<string[]>([]);
  const [requireAck, setRequireAck] = React.useState(false);
  const [requestCheckin, setRequestCheckin] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const audience: Record<string, Json> = mode === "all" ? { all: true } : mode === "departments" ? { department_ids: deptIds } : mode === "teams" ? { team_ids: teamIds } : mode === "roles" ? { roles } : { user_ids: userIds };
  const reach = mode === "all" ? people.length : mode === "departments" ? people.filter((p) => p.department_id && deptIds.includes(p.department_id)).length : mode === "roles" ? people.filter((p) => roles.includes(p.role)).length : mode === "people" ? userIds.length : null;
  const modeOk = mode === "all" ? canCompany : mode === "departments" ? (canDepartment || canCompany) && deptIds.length > 0 : canCompany && (mode === "teams" ? teamIds.length > 0 : mode === "roles" ? roles.length > 0 : userIds.length > 0);
  const canSend = title.trim().length >= 4 && body.trim().length >= 10 && modeOk;
  const roleList = (Object.keys(ROLE_LABEL) as RoleLevel[]).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    if (!window.confirm(`Send this ${BROADCAST_KIND_LABEL[kind].toLowerCase()} broadcast${reach != null ? ` to ${reach} people` : ""}? Everyone in the audience gets a critical notification.`)) return;
    setBusy(true);
    const { data, error } = await createClient().from("broadcasts").insert({ org_id: profile.org_id!, title: title.trim(), body: body.trim(), kind, audience: audience as Json, require_ack: requireAck, request_checkin: requestCheckin, created_by: profile.id }).select("id").single();
    setBusy(false);
    if (error || !data) return toast.push(friendlyError(error?.message || "Could not send"), "danger");
    toast.push("Broadcast sent", "success");
    router.push(`/broadcasts/${data.id}`);
  }

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="page page-narrow">
      <Link href="/admin/organization?tab=emergency" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> Organization Control</Link>
      <PageHeader eyebrow="Communication" title="New broadcast" subtitle="For things that cannot wait: outages, emergencies, office closures. Everyone in the audience is notified immediately — use Announcements for routine news." />
      <form onSubmit={send} className="space-y-[var(--s3)]">
        <Card className="p-[var(--s4)] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
            <Field label="Kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>{BROADCAST_KINDS.map((k) => <option key={k} value={k}>{BROADCAST_KIND_LABEL[k]}</option>)}</Select>
            </Field>
            <Field label="Title"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office closed tomorrow — heavy rain warning" required /></Field>
          </div>
          <Field label="Message" hint="Say what happened, what people should do, and who to contact."><Textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 110 }} required /></Field>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Switch on={requireAck} onChange={setRequireAck} label="Require acknowledgement" hint="Track who has read it" />
            <Switch on={requestCheckin} onChange={setRequestCheckin} label="Request check-in" hint="Safe / need help / not at office" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Audience" subtitle={reach != null ? `${reach} people` : undefined} />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "departments", "teams", "roles", "people"] as AudienceMode[]).map((m) => {
                const allowed = m === "departments" ? canDepartment || canCompany : canCompany;
                return <button key={m} type="button" disabled={!allowed} onClick={() => setMode(m)} className={cn("pill pill-lg capitalize", mode === m ? "tone-brand" : "tone-neutral", !allowed && "opacity-50 cursor-not-allowed")} title={!allowed ? "Needs the company-wide broadcast permission" : undefined}>{m === "all" ? "Everyone" : m}</button>;
              })}
            </div>
            {mode === "departments" && <div className="flex flex-wrap gap-1.5">{departments.map((d) => <button key={d.id} type="button" onClick={() => toggle(deptIds, setDeptIds, d.id)} className={cn("pill pill-lg", deptIds.includes(d.id) ? "tone-brand" : "tone-neutral")}>{d.name}</button>)}</div>}
            {mode === "teams" && (teams.length ? <div className="flex flex-wrap gap-1.5">{teams.map((t) => <button key={t.id} type="button" onClick={() => toggle(teamIds, setTeamIds, t.id)} className={cn("pill pill-lg", teamIds.includes(t.id) ? "tone-brand" : "tone-neutral")}>{t.name}</button>)}</div> : <div className="text-sm text-muted">No teams defined yet.</div>)}
            {mode === "roles" && <div className="flex flex-wrap gap-1.5">{roleList.map((r) => <button key={r} type="button" onClick={() => toggle(roles, setRoles, r)} className={cn("pill pill-lg", roles.includes(r) ? "tone-brand" : "tone-neutral")}>{ROLE_LABEL[r]}</button>)}</div>}
            {mode === "people" && <PeopleMultiSelect value={userIds} onChange={setUserIds} />}
            {!canCompany && !canDepartment && <div className="text-sm text-danger">You do not have a broadcast permission. Ask your department head or an administrator.</div>}
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href="/admin/organization?tab=emergency" className="btn btn-ghost">Cancel</Link>
          <Button type="submit" variant={kind === "emergency" ? "danger" : "primary"} loading={busy} disabled={!canSend}>{kind === "emergency" ? <ShieldAlert size={15} /> : <Megaphone size={15} />} Send broadcast <Send size={13} /></Button>
        </div>
      </form>
    </div>
  );
}

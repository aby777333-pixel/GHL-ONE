"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldAlert, RefreshCw, Globe, Hourglass, ScrollText, Fingerprint, UserSearch } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Pill, Select } from "@/components/ui";
import { ago, cn, fmtDate, humanize, ROLE_LABEL, type Tables } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { LevelPill, PersonLine, ResourceTypePill, Metric } from "./AdminBits";
import { resourceHref } from "./resourceLabels";

export type SecurityEventRow = Tables<"security_events">;
export type SecurityAuditRow = Pick<Tables<"audit_logs">, "id" | "action" | "entity_type" | "entity_id" | "summary" | "actor_id" | "created_at" | "new_value">;
export type GuestRow = { id: string; full_name: string; email: string; avatar_url: string | null; role: Tables<"profiles">["role"]; designation: string | null; last_seen_at: string | null; department_id: string | null; joined_at: string | null };
export type ExpiringGrant = Tables<"access_grants"> & { label?: string | null };

const KIND_TONE: Record<string, string> = { login: "tone-success", failed_login: "tone-danger", export: "tone-warn", external_share: "tone-warn", break_glass: "tone-danger", permission_change: "tone-violet", view_as: "tone-info", revoke: "tone-danger" };
const KINDS = ["login", "failed_login", "export", "external_share", "break_glass", "permission_change", "view_as", "revoke"];

function actionTone(a: string) {
  if (a.includes("revoke") || a.includes("rejected") || a.includes("expired")) return "tone-danger";
  if (a.includes("approved")) return "tone-success";
  if (a.includes("requested")) return "tone-warn";
  if (a.includes("view_as")) return "tone-info";
  return "tone-neutral";
}

function detailText(j: Json | null) {
  if (j == null) return "";
  if (typeof j !== "object" || Array.isArray(j)) return String(j);
  return Object.entries(j).map(([k, v]) => `${k}: ${v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
}

export function SecurityCenter({ events: initialEvents, audit, guests, expiringGrants }: { events: SecurityEventRow[]; audit: SecurityAuditRow[]; guests: GuestRow[]; expiringGrants: ExpiringGrant[] }) {
  const [events, setEvents] = React.useState(initialEvents);
  const [kind, setKind] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [now] = React.useState(() => Date.now());

  async function reload() {
    setLoading(true);
    const { data } = await createClient().from("security_events").select("*").order("created_at", { ascending: false }).limit(200);
    setEvents((data || []) as SecurityEventRow[]);
    setLoading(false);
  }

  const kinds = React.useMemo(() => [...new Set([...KINDS, ...events.map((e) => e.kind)])], [events]);
  const list = events.filter((e) => !kind || e.kind === kind);
  const last24 = events.filter((e) => now - new Date(e.created_at).getTime() < 86_400_000).length;
  const failed24 = events.filter((e) => e.kind === "failed_login" && now - new Date(e.created_at).getTime() < 86_400_000).length;
  const viewAs = audit.filter((a) => a.action === "security.view_as").length;
  const revocations = audit.filter((a) => a.action === "access.revoked" || a.action === "security.revoke_everywhere").length;
  const highRiskRequests = audit.filter((a) => a.action === "access.requested" && isHigh(a.new_value)).length;

  return (
    <div className="space-y-[var(--s4)]">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-[var(--s2)]">
        <Metric label="Events 24h" value={last24} tone={last24 > 0 ? "text-warn" : undefined} icon={<Fingerprint size={13} />} />
        <Metric label="Failed logins 24h" value={failed24} tone={failed24 > 0 ? "text-danger" : undefined} />
        <Metric label="View-as checks" value={viewAs} sub="last 200 audit rows" icon={<UserSearch size={13} />} />
        <Metric label="Revocations" value={revocations} tone={revocations > 0 ? "text-danger" : undefined} sub="last 200 audit rows" />
        <Metric label="High-risk requests" value={highRiskRequests} tone={highRiskRequests > 0 ? "text-warn" : undefined} sub="last 200 audit rows" />
        <Metric label="External guests" value={guests.length} icon={<Globe size={13} />} href="#guests" />
      </div>

      <div className="grid lg:grid-cols-5 gap-[var(--s4)] items-start">
        <Card className="lg:col-span-3">
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><ShieldAlert size={16} className="text-[var(--danger)]" /> Security events</span>}
            subtitle="Logins, failed logins, exports, external shares, break-glass, permission changes, view-as, revocations."
            action={<div className="flex items-center gap-2"><Select value={kind} onChange={(e) => setKind(e.target.value)} className="!h-8 !text-xs w-[150px]"><option value="">All kinds</option>{kinds.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select><Button variant="ghost" size="sm" icon aria-label="Refresh" onClick={reload}><RefreshCw size={14} className={cn(loading && "animate-spin")} /></Button></div>}
          />
          {list.length === 0 ? <EmptyState icon={<ShieldAlert size={18} />} title="No security events" hint="Events are written by the app and its integrations as they happen. Quiet is good." className="py-[var(--s5)]" /> : (
            <div className="divide-y border-t max-h-[640px] overflow-y-auto">
              {list.map((e) => (
                <div key={e.id} className="px-[var(--s4)] py-2.5 flex items-start gap-3">
                  <Pill tone={KIND_TONE[e.kind] || "tone-neutral"} className="shrink-0 mt-0.5">{humanize(e.kind)}</Pill>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0"><PersonLine id={e.user_id} size={18} name={e.user_id ? undefined : "System"} /></div>
                    {e.details != null && <div className="text-xs text-muted mt-0.5 break-all">{detailText(e.details)}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-muted num" title={fmtDate(e.created_at, true)}>{ago(e.created_at)}</div>
                    {e.ip && <div className="text-[10px] font-mono text-muted">{e.ip}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-[var(--s4)]">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><ScrollText size={15} className="text-muted" /> Access & security trail</span>} subtitle="Derived from the audit log — security.* and access.* actions" action={<Link href="/admin?tab=audit" className="text-xs text-muted hover:text-[var(--fg)] shrink-0">Full log →</Link>} />
            {audit.length === 0 ? <EmptyState title="Nothing yet" className="py-4" /> : (
              <div className="divide-y border-t max-h-[360px] overflow-y-auto">
                {audit.map((a) => (
                  <div key={a.id} className="px-[var(--s4)] py-2 flex items-start gap-2">
                    <Pill tone={actionTone(a.action)} className="shrink-0 mt-0.5">{a.action}</Pill>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{a.summary || humanize(a.entity_type)}</div>
                      <div className="text-[11px] text-muted flex items-center gap-1 flex-wrap"><PersonLine id={a.actor_id} size={14} name={a.actor_id ? undefined : "System"} className="!gap-1" /> · {ago(a.created_at)}{isHigh(a.new_value) && <Pill tone="tone-danger">High risk</Pill>}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card id="guests">
            <CardHeader title={<span className="inline-flex items-center gap-2"><Globe size={15} className="text-muted" /> External guests <span className="pill tone-neutral">{guests.length}</span></span>} subtitle="Consultants, vendors and guests with an active account" />
            {guests.length === 0 ? <EmptyState title="No external accounts" className="py-4" /> : (
              <div className="divide-y border-t">
                {guests.map((g) => (
                  <Link key={g.id} href={`/people/${g.id}`} className="px-[var(--s4)] py-2 flex items-center gap-2.5 row-hover">
                    <Avatar name={g.full_name} src={g.avatar_url} size={26} />
                    <div className="min-w-0 flex-1"><div className="text-sm truncate">{g.full_name}</div><div className="text-[11px] text-muted truncate">{g.email}{g.designation ? ` · ${g.designation}` : ""}</div></div>
                    <Pill tone="tone-muted">{ROLE_LABEL[g.role]}</Pill>
                    <span className={cn("text-[11px] num whitespace-nowrap", g.last_seen_at && now - new Date(g.last_seen_at).getTime() > 30 * 86_400_000 ? "text-warn" : "text-muted")}>{g.last_seen_at ? `seen ${ago(g.last_seen_at)}` : "never seen"}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Hourglass size={15} className="text-muted" /> Temporary grants expiring in 7 days <span className="pill tone-neutral">{expiringGrants.length}</span></span>} action={<Link href="/admin?tab=access" className="text-xs text-muted hover:text-[var(--fg)] shrink-0">Manage →</Link>} />
            {expiringGrants.length === 0 ? <EmptyState title="Nothing expiring this week" className="py-4" /> : (
              <div className="divide-y border-t">
                {expiringGrants.map((g) => {
                  const href = resourceHref(g.resource_type, g.resource_id);
                  const soon = g.expires_at && new Date(g.expires_at).getTime() - now < 86_400_000;
                  return (
                    <div key={g.id} className="px-[var(--s4)] py-2 flex items-center gap-2 min-w-0">
                      <div className="min-w-0 flex-1"><PersonLine id={g.user_id} size={20} /></div>
                      <ResourceTypePill type={g.resource_type} />
                      {href ? <Link href={href} className="link text-xs truncate max-w-[140px]">{g.label || g.resource_id.slice(0, 8)}</Link> : <span className="text-xs truncate max-w-[140px]">{g.label || g.resource_id.slice(0, 8)}</span>}
                      <LevelPill level={g.level} />
                      <span className={cn("text-[11px] num whitespace-nowrap", soon ? "text-danger font-medium" : "text-warn")}>{g.expires_at ? ago(g.expires_at) : ""}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function isHigh(j: Json | null) {
  return !!j && typeof j === "object" && !Array.isArray(j) && (j as Record<string, unknown>).risk === "high";
}

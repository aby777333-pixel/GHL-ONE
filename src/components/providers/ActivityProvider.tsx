"use client";

/**
 * Activity lights — "a light blinks wherever anything happens".
 *
 * One Realtime subscription per session (Postgres changes are RLS-filtered by Supabase, so a person only ever
 * receives events for rows they are allowed to see). Each event is mapped to one or more *zones*:
 *   nav:/chat · nav:/tasks · nav:/help · nav:/approvals · nav:/inbox · nav:/attendance · nav:/admin · nav:/projects …
 *   dept:<department_id> · channel:<channel_id> · project:<project_id> · task:<task_id> · user:<user_id> · team:<team_id>
 * Components render `<Blink zone="…" />` (a small pulsing dot) or read `useActivity(zone)`.
 * A zone stops blinking when it is *seen*: visiting the matching route, mounting `useSeen(zone)`, or after 15 minutes.
 * Role/team scoping happens here (on top of RLS): e.g. attendance lights only for managers / the same department,
 * access-request lights only for admins/approvers. Quiet hours / DND mute the pulse animation (dot stays, no blink).
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { isManagerPlus, isLeadPlus, isAdminRole } from "@/lib/utils";

export type ActivityTone = "brand" | "warn" | "danger" | "success" | "violet";
export type ActivityRecord = { at: number; count: number; tone: ActivityTone; label?: string };
type ActivityMap = Map<string, ActivityRecord>;

type Ctx = {
  zones: ActivityMap;
  seen: (zone: string | string[]) => void;
  muted: boolean;
};
const ActivityContext = React.createContext<Ctx | null>(null);

const TTL_MS = 15 * 60_000;
const NAV_BY_PATH: Array<[string, string]> = [
  ["/chat", "nav:/chat"], ["/tasks", "nav:/tasks"], ["/my-work", "nav:/my-work"], ["/help", "nav:/help"], ["/approvals", "nav:/approvals"],
  ["/inbox", "nav:/inbox"], ["/attendance", "nav:/attendance"], ["/admin", "nav:/admin"], ["/projects", "nav:/projects"], ["/common", "nav:/common"],
  ["/announcements", "nav:/announcements"], ["/decisions", "nav:/decisions"], ["/departments", "nav:/departments"], ["/people", "nav:/people"],
  ["/leave", "nav:/leave"], ["/meetings", "nav:/meetings"], ["/ideas", "nav:/ideas"], ["/files", "nav:/files"], ["/connect", "nav:/connect"],
  ["/live", "nav:/live"], ["/boards", "nav:/boards"], ["/recordings", "nav:/recordings"], ["/docs", "nav:/docs"],
];

type Row = Record<string, unknown>;
type Payload = { eventType: "INSERT" | "UPDATE" | "DELETE"; table: string; new: Row; old: Row };

export function ActivityProvider({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  const { profile } = useSession();
  const pathname = usePathname();
  const [zones, setZones] = React.useState<ActivityMap>(() => new Map());
  // Quiet hours / DND / focus: keep the dot, stop the pulse.
  const [quiet, setQuiet] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    const check = async () => {
      const { data } = await createClient().from("notification_prefs").select("dnd_until,quiet_start,quiet_end").eq("user_id", profile.id).maybeSingle();
      if (!alive) return;
      const now = new Date();
      const dnd = !!data?.dnd_until && Date.parse(data.dnd_until) > now.getTime();
      let inQuiet = false;
      if (data?.quiet_start && data?.quiet_end) {
        const [sh, sm] = String(data.quiet_start).split(":").map(Number);
        const [eh, em] = String(data.quiet_end).split(":").map(Number);
        const cur = now.getHours() * 60 + now.getMinutes();
        const start = sh * 60 + sm;
        const end = eh * 60 + em;
        inQuiet = start <= end ? cur >= start && cur < end : cur >= start || cur < end;
      }
      setQuiet(dnd || inQuiet || profile.presence === "dnd" || profile.presence === "focus");
    };
    const t = setTimeout(check, 0);
    const id = setInterval(check, 5 * 60_000);
    return () => { alive = false; clearTimeout(t); clearInterval(id); };
  }, [profile.id, profile.presence]);

  const seen = React.useCallback((zone: string | string[]) => {
    const list = Array.isArray(zone) ? zone : [zone];
    setZones((prev) => {
      if (!list.some((z) => prev.has(z))) return prev;
      const next = new Map(prev);
      for (const z of list) next.delete(z);
      return next;
    });
  }, []);

  // Visiting a route clears its nav zone (and entity zones encoded in the path).
  React.useEffect(() => {
    const clear: string[] = [];
    for (const [prefix, zone] of NAV_BY_PATH) if (pathname === prefix || pathname.startsWith(prefix + "/")) clear.push(zone);
    const m = pathname.match(/^\/(chat|projects|tasks|departments|people|help|connect|live)\/([^/?]+)/);
    if (m) clear.push(`${{ chat: "channel", projects: "project", tasks: "task", departments: "dept", people: "user", help: "help", connect: "conversation", live: "live" }[m[1]]}:${m[2]}`);
    if (clear.length) {
      const t = setTimeout(() => seen(clear), 0);
      return () => clearTimeout(t);
    }
  }, [pathname, seen]);

  React.useEffect(() => {
    const me = profile.id;
    const myDept = profile.department_id;
    const myTeam = profile.team_id;
    const manager = isManagerPlus(profile.role);
    const lead = isLeadPlus(profile.role);
    const admin = isAdminRole(profile.role);

    const light = (targets: string[], tone: ActivityTone, label?: string) => {
      const now = Date.now();
      setZones((prev) => {
        const next = new Map(prev);
        for (const z of targets) {
          if (!z || z.endsWith(":null") || z.endsWith(":undefined")) continue;
          const cur = next.get(z);
          next.set(z, { at: now, count: (cur?.count || 0) + 1, tone: cur && rank(cur.tone) > rank(tone) ? cur.tone : tone, label });
        }
        return next;
      });
    };

    const handle = (p: Payload) => {
      const r = (p.eventType === "DELETE" ? p.old : p.new) || {};
      const s = (k: string) => (r[k] == null ? null : String(r[k]));
      switch (p.table) {
        case "messages": {
          if (s("author_id") === me || s("kind") === "system") return;
          light([`channel:${s("channel_id")}`, "nav:/chat"], "brand", "New message");
          return;
        }
        case "tasks": {
          const zones = [`task:${s("id")}`, `project:${s("project_id")}`, `dept:${s("department_id")}`];
          const mine = s("assignee_id") === me || s("owner_id") === me || s("delegated_by") === me || s("approver_id") === me;
          if (mine) zones.push("nav:/my-work", "nav:/tasks");
          else if (lead && (s("department_id") === myDept || manager)) zones.push("nav:/tasks");
          const st = s("status");
          light(zones, st === "blocked" ? "danger" : st === "waiting" || st === "in_review" ? "warn" : st === "done" ? "success" : "brand", `Task ${p.eventType.toLowerCase()}`);
          return;
        }
        case "help_requests": {
          const zones = [`help:${s("id")}`, `dept:${s("department_id")}`];
          if (s("requester_id") === me || s("owner_id") === me || s("department_id") === myDept || manager) zones.push("nav:/help");
          light(zones, s("status") === "new" ? "warn" : s("status") === "completed" ? "success" : "brand", "Help request");
          return;
        }
        case "approvals": {
          const zones = [`approval:${s("id")}`, `project:${s("project_id")}`];
          if (s("approver_id") === me || s("requester_id") === me || manager) zones.push("nav:/approvals");
          light(zones, s("status") === "pending" ? "warn" : s("status") === "approved" ? "success" : "danger", "Approval");
          return;
        }
        case "notifications": {
          if (s("user_id") !== me) return;
          light(["nav:/inbox"], s("kind") === "critical" ? "danger" : s("kind") === "action_required" || s("kind") === "approval" ? "warn" : "brand", "Notification");
          return;
        }
        case "attendance_events": {
          if (s("user_id") === me) return;
          const zones = [`user:${s("user_id")}`];
          if (manager || lead) zones.push("nav:/attendance");
          light(zones, "success", "Attendance");
          return;
        }
        case "access_requests": {
          if (!(admin || s("approver_id") === me || s("requester_id") === me)) return;
          light(["nav:/admin", `access:${s("id")}`], s("risk") === "high" ? "danger" : "warn", "Access request");
          return;
        }
        case "handoffs": {
          const zones = [`task:${s("task_id")}`, `dept:${s("to_department_id")}`, `dept:${s("from_department_id")}`];
          if (s("to_user_id") === me || s("from_user_id") === me || s("to_department_id") === myDept) zones.push("nav:/tasks");
          light(zones, "violet", "Handoff");
          return;
        }
        case "leaves": {
          const zones = [`user:${s("user_id")}`, "nav:/leave"];
          if (manager) zones.push("nav:/approvals");
          light(zones, s("status") === "pending" ? "warn" : "brand", "Leave");
          return;
        }
        case "announcements": {
          light(["nav:/announcements", "nav:/common"], "violet", "Announcement");
          return;
        }
        case "decisions": {
          light(["nav:/decisions", `project:${s("project_id")}`, `dept:${s("department_id")}`], "brand", "Decision");
          return;
        }
        case "projects": {
          light([`project:${s("id")}`, `dept:${s("department_id")}`, "nav:/projects"], s("status") === "at_risk" || s("status") === "delayed" ? "danger" : "brand", "Project");
          return;
        }
        case "channels": {
          if (p.eventType !== "INSERT" || s("created_by") === me || s("type") === "dm") return;
          light(["nav:/chat", "nav:/common", `dept:${s("department_id")}`], "brand", "New room");
          return;
        }
        case "channel_members": {
          if (p.eventType === "INSERT" && s("user_id") === me) light([`channel:${s("channel_id")}`, "nav:/chat"], "brand", "Added to a room");
          return;
        }
        case "profiles": {
          if (s("id") === me) return;
          if (p.eventType === "UPDATE" && s("presence") !== String((p.old || {}).presence ?? "")) light([`user:${s("id")}`, ...(s("team_id") && s("team_id") === myTeam ? [`team:${s("team_id")}`] : [])], "success", "Presence");
          return;
        }
        case "conversations": {
          // GHL Connect: RLS already limits this to inboxes / conversations the viewer can open.
          if (p.eventType === "DELETE") return;
          const zones = [`conversation:${s("id")}`];
          if (s("status") === "open" || s("status") === "pending") zones.push("nav:/connect");
          light(zones, s("sla_breached") === "true" ? "danger" : s("vip") === "true" || s("priority") === "urgent" || s("priority") === "critical" ? "warn" : "brand", "Conversation");
          return;
        }
        case "live_rooms": {
          // GHL LIVE: a room opening / going live is exactly the kind of thing a light is for.
          if (p.eventType === "DELETE" || s("created_by") === me) return;
          const zones = [`live:${s("id")}`, `project:${s("project_id")}`, `dept:${s("department_id")}`, `channel:${s("channel_id")}`, `task:${s("task_id")}`, `help:${s("help_request_id")}`];
          const status = s("status");
          if (status === "live") zones.push("nav:/live");
          if (status === "ended" || status === "archived") return;
          light(zones, s("kind") === "war_room" ? "danger" : "success", "Live room");
          return;
        }
        case "live_invites": {
          if (p.eventType !== "INSERT" || s("to_user") !== me) return;
          light(["nav:/live", `live:${s("room_id")}`, `user:${s("from_user")}`], "danger", s("kind") === "knock" ? "Someone is knocking" : "Incoming call");
          return;
        }
        case "conversation_messages": {
          if (p.eventType !== "INSERT" || s("author_id") === me || s("kind") === "system") return;
          light([`conversation:${s("conversation_id")}`, "nav:/connect"], s("status") === "pending_approval" ? "warn" : "brand", s("direction") === "inbound" ? "New reply" : "Message");
          return;
        }
        default:
          return;
      }
    };

    const supabase = createClient();
    const tables = ["messages", "tasks", "help_requests", "approvals", "notifications", "attendance_events", "access_requests", "handoffs", "leaves", "announcements", "decisions", "projects", "channels", "channel_members", "profiles", "conversations", "conversation_messages", "live_rooms", "live_invites"];
    let ch = supabase.channel("activity-lights");
    for (const table of tables) ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, (p) => handle(p as unknown as Payload));
    // Realtime evaluates RLS with the token present at join time — make sure it is the user's, not the anon key.
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[activity-lights]", status, err?.message);
      });
    });

    // expire old lights
    const gc = setInterval(() => {
      const cutoff = Date.now() - TTL_MS;
      setZones((prev) => {
        if (![...prev.values()].some((v) => v.at < cutoff)) return prev;
        const next = new Map(prev);
        for (const [k, v] of prev) if (v.at < cutoff) next.delete(k);
        return next;
      });
    }, 60_000);
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      clearInterval(gc);
    };
  }, [profile.id, profile.department_id, profile.team_id, profile.role]);

  const value = React.useMemo<Ctx>(() => ({ zones, seen, muted: muted || quiet }), [zones, seen, muted, quiet]);
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

function rank(t: ActivityTone) {
  return { success: 0, brand: 1, violet: 1, warn: 2, danger: 3 }[t];
}

/** Read the activity record for a zone (re-renders on change). */
export function useActivity(zone: string | undefined | null): ActivityRecord | null {
  const ctx = React.useContext(ActivityContext);
  if (!ctx || !zone) return null;
  return ctx.zones.get(zone) || null;
}

/** Aggregate over several zones (e.g. all channels in a list). */
export function useActivityAny(zones: string[]): ActivityRecord | null {
  const ctx = React.useContext(ActivityContext);
  if (!ctx) return null;
  let best: ActivityRecord | null = null;
  for (const z of zones) {
    const r = ctx.zones.get(z);
    if (r && (!best || rank(r.tone) > rank(best.tone) || r.at > best.at)) best = r;
  }
  return best;
}

/** Mark a zone as seen while this component is mounted (call in the detail view of the thing). */
export function useSeen(zone: string | string[] | undefined | null) {
  const ctx = React.useContext(ActivityContext);
  const key = Array.isArray(zone) ? zone.join("|") : zone || "";
  React.useEffect(() => {
    if (!ctx || !key) return;
    const t = setTimeout(() => ctx.seen(key.split("|")), 400);
    return () => clearTimeout(t);
  }, [ctx, key]);
}

export function useActivityMuted() {
  return React.useContext(ActivityContext)?.muted ?? false;
}

/** The light. Renders nothing when the zone is quiet. */
export function Blink({ zone, zones, className, size = 7, title }: { zone?: string; zones?: string[]; className?: string; size?: number; title?: string }) {
  const one = useActivity(zone);
  const many = useActivityAny(zones || []);
  const muted = useActivityMuted();
  const rec = one || many;
  if (!rec) return null;
  const color = { brand: "var(--brand-2)", warn: "var(--warn)", danger: "var(--danger)", success: "var(--success)", violet: "var(--violet)" }[rec.tone];
  return (
    <span
      className={"blink-dot " + (muted ? "blink-muted " : "") + (className || "")}
      style={{ width: size, height: size, ["--blink" as string]: color }}
      title={title || rec.label}
      aria-label={rec.label || "New activity"}
      data-count={rec.count}
    />
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AtSign, BellRing, Check, Hash, MessageSquare, Monitor, MoonStar, Save, Star, Users, Volume2, VolumeX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Select, Skeleton, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { cn, fmtDate, type Tables } from "@/lib/utils";
import { previewSound } from "@/lib/notifications/sound";
import { desktopPermission, requestDesktopPermission, showDesktopNotification, type DesktopPermission } from "@/lib/notifications/desktop";
import { announcePrefsChanged } from "@/lib/notifications/prefs";

type Prefs = Tables<"notification_prefs">;
type Mode = "immediate" | "daily" | "weekly";
type DndChoice = "off" | "30m" | "1h" | "tomorrow" | "custom";
type GroupAlerts = "all" | "mentions" | "none";

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "immediate", label: "Immediate", hint: "Every notification lands in your Inbox as it happens." },
  { key: "daily", label: "Daily digest · 08:30", hint: "Chosen kinds are grouped into one morning summary." },
  { key: "weekly", label: "Weekly digest · Monday 08:30", hint: "Chosen kinds are grouped into one Monday summary." },
];
const DIGESTABLE: { key: string; label: string }[] = [
  { key: "information", label: "Information" },
  { key: "mention", label: "Mentions" },
  { key: "deadline", label: "Deadlines" },
  { key: "approval", label: "Approvals" },
];
const DND_OPTIONS: { key: DndChoice; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "30m", label: "30 minutes" },
  { key: "1h", label: "1 hour" },
  { key: "tomorrow", label: "Until tomorrow 08:00" },
  { key: "custom", label: "Custom…" },
];
const GROUP_OPTIONS: { key: GroupAlerts; label: string; hint: string }[] = [
  { key: "all", label: "Every message", hint: "A pop-up and a sound for each group message (bursts are folded into one)." },
  { key: "mentions", label: "Mentions and important only", hint: "Ordinary chatter stays quiet; mentions, @everyone and messages marked important still reach you." },
  { key: "none", label: "Mute all groups", hint: "Only urgent, critical and acknowledgement-required messages get through." },
];
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

/** ISO timestamp for a DND choice (null = off). */
export function dndUntilFor(choice: DndChoice, custom?: string): string | null {
  const now = new Date();
  if (choice === "30m") return new Date(now.getTime() + 30 * 60_000).toISOString();
  if (choice === "1h") return new Date(now.getTime() + 60 * 60_000).toISOString();
  if (choice === "tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(8, 0, 0, 0);
    return t.toISOString();
  }
  if (choice === "custom" && custom) return new Date(custom).toISOString();
  return null;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const hhmm = (t: string | null | undefined, fallback: string) => (t ? t.slice(0, 5) : fallback);

function Toggle({ checked, onChange, label, hint, icon }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--brand)] mt-1" />
      <span className="min-w-0">
        <span className="inline-flex items-center gap-1.5 font-medium">{icon}{label}</span>
        {hint && <span className="block text-[11px] text-muted mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Notification preferences for the signed-in user (`notification_prefs`, RLS = own row only).
 * Rendered on my profile at #notifications. Everything the database trigger consults (DM alerts,
 * group alerts, muted channels, priority people, batching) and everything the browser consults
 * (sound, volume, desktop, previews, shared device) lives here.
 */
export function NotificationSettings() {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [loaded, setLoaded] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("immediate");
  const [digest, setDigest] = React.useState<Set<string>>(() => new Set(["information"]));
  const [quietOn, setQuietOn] = React.useState(true);
  const [quietStart, setQuietStart] = React.useState("21:00");
  const [quietEnd, setQuietEnd] = React.useState("08:00");
  const [dnd, setDnd] = React.useState<DndChoice>("off");
  const [dndCustom, setDndCustom] = React.useState("");
  const [dndActiveUntil, setDndActiveUntil] = React.useState<string | null>(null);
  const [muted, setMuted] = React.useState<Set<string>>(() => new Set());
  const [priority, setPriority] = React.useState<string[]>([]);
  const [channels, setChannels] = React.useState<{ id: string; name: string; type: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  // 0075
  const [sound, setSound] = React.useState(true);
  const [volume, setVolume] = React.useState(70);
  const [desktop, setDesktop] = React.useState(true);
  const [dmAlerts, setDmAlerts] = React.useState(true);
  const [groupAlerts, setGroupAlerts] = React.useState<GroupAlerts>("all");
  const [previews, setPreviews] = React.useState(true);
  const [batching, setBatching] = React.useState(true);
  const [sharedDevice, setSharedDevice] = React.useState(false);
  const [workOn, setWorkOn] = React.useState(false);
  const [workStart, setWorkStart] = React.useState("10:00");
  const [workEnd, setWorkEnd] = React.useState("18:30");
  const [timezone, setTimezone] = React.useState("");
  const [permission, setPermission] = React.useState<DesktopPermission>("default");

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    (async () => {
      const [{ data: p }, { data: ch }] = await Promise.all([
        supabase.from("notification_prefs").select("*").eq("user_id", profile.id).maybeSingle(),
        supabase.from("channels").select("id,name,type").neq("type", "dm").order("name").limit(200),
      ]);
      if (!alive) return;
      setPermission(desktopPermission());
      setChannels(ch || []);
      const row = p as Prefs | null;
      if (row) {
        setMode(row.mode === "daily" || row.mode === "weekly" ? row.mode : "immediate");
        setDigest(new Set(row.digest_kinds || []));
        const on = !!(row.quiet_start && row.quiet_end);
        setQuietOn(on);
        setQuietStart(hhmm(row.quiet_start, "21:00"));
        setQuietEnd(hhmm(row.quiet_end, "08:00"));
        setMuted(new Set(row.muted_channels || []));
        setPriority(row.priority_people || []);
        const active = row.dnd_until && new Date(row.dnd_until) > new Date() ? row.dnd_until : null;
        setDndActiveUntil(active);
        if (active) {
          setDnd("custom");
          setDndCustom(toLocalInput(active));
        }
        setSound(row.sound ?? true);
        setVolume(row.sound_volume ?? 70);
        setDesktop(row.desktop ?? true);
        setDmAlerts(row.dm_alerts ?? true);
        setGroupAlerts(row.group_alerts === "mentions" || row.group_alerts === "none" ? row.group_alerts : "all");
        setPreviews(row.previews ?? true);
        setBatching(row.batching ?? true);
        setSharedDevice(row.shared_device ?? false);
        const work = !!(row.working_start && row.working_end);
        setWorkOn(work);
        setWorkStart(hhmm(row.working_start, "10:00"));
        setWorkEnd(hhmm(row.working_end, "18:30"));
        setTimezone(row.timezone || "");
      }
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [profile.id]);

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    setter((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  async function enableDesktop() {
    const p = await requestDesktopPermission();
    setPermission(p);
    if (p === "granted") {
      setDesktop(true);
      await showDesktopNotification({ title: "GHL ONE notifications are on", body: "You will see new messages here when GHL ONE is in another tab.", tag: "ghl-test", link: "/inbox" });
    } else if (p === "denied") toast.push("Your browser is blocking notifications for this site. Allow them from the padlock beside the address bar.", "danger");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (dnd === "custom" && !dndCustom) return toast.push("Choose when Do-not-disturb should end", "danger");
    setBusy(true);
    const supabase = createClient();
    const dndUntil = dndUntilFor(dnd, dndCustom);
    const { error } = await supabase.from("notification_prefs").upsert(
      {
        user_id: profile.id,
        mode,
        digest_kinds: [...digest],
        quiet_start: quietOn ? quietStart : null,
        quiet_end: quietOn ? quietEnd : null,
        dnd_until: dndUntil,
        muted_channels: [...muted],
        priority_people: priority,
        sound,
        sound_volume: volume,
        desktop,
        dm_alerts: dmAlerts,
        group_alerts: groupAlerts,
        previews,
        batching,
        shared_device: sharedDevice,
        working_start: workOn ? workStart : null,
        working_end: workOn ? workEnd : null,
        timezone: timezone || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (!error) {
      // Mirror DND onto presence so colleagues see it in chat and the directory.
      const wantDnd = !!dndUntil;
      if (wantDnd && profile.presence !== "dnd") await supabase.from("profiles").update({ presence: "dnd" }).eq("id", profile.id);
      else if (!wantDnd && profile.presence === "dnd") await supabase.from("profiles").update({ presence: "available" }).eq("id", profile.id);
    }
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    setDndActiveUntil(dndUntil);
    announcePrefsChanged();
    toast.push("Notification preferences saved", "success");
    router.refresh();
  }

  if (!loaded) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9 w-1/2" />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-[var(--s4)]">
      {/* Alerts: sound + desktop */}
      <div>
        <div className="eyebrow mb-2">Alerts</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-2">
            <Toggle checked={sound} onChange={setSound} label="Play a sound" hint="A soft note for group messages, two for a direct message, three for a mention; urgent and critical are louder." icon={sound ? <Volume2 size={13} /> : <VolumeX size={13} />} />
            <div className={cn("flex items-center gap-2 pl-6", !sound && "opacity-50")}>
              <input type="range" min={0} max={100} step={5} value={volume} onChange={(e) => setVolume(Number(e.target.value))} disabled={!sound} className="flex-1 accent-[var(--brand)]" aria-label="Volume" />
              <span className="text-[11px] text-muted num w-8 text-right">{volume}%</span>
              <Button type="button" size="xs" variant="ghost" disabled={!sound} onClick={() => { if (!previewSound("dm", volume)) toast.push("Click anywhere on the page first, then try again — browsers only play sound after a click.", "info"); }}>Play test</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Toggle checked={desktop} onChange={setDesktop} label="Desktop notifications" hint="A system notification when GHL ONE is open in another tab or behind another window. Push (below, on your profile) covers the browser being closed." icon={<Monitor size={13} />} />
            <div className="pl-6 text-[11px] text-muted">
              {permission === "granted" && <span className="pill tone-success"><Check size={10} /> Browser permission granted</span>}
              {permission === "default" && <Button type="button" size="xs" variant="secondary" onClick={enableDesktop}>Allow in this browser</Button>}
              {permission === "denied" && <span className="pill tone-danger">Blocked by the browser — allow notifications from the padlock beside the address bar</span>}
              {permission === "unsupported" && <span className="pill tone-neutral">Not supported in this browser</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div>
        <div className="eyebrow mb-2">Messages</div>
        <div className="space-y-3">
          <Toggle checked={dmAlerts} onChange={setDmAlerts} label="Direct message alerts" hint="A pop-up and the direct-message sound for every DM. Off: DMs still arrive and count as unread, but do not alert you (urgent ones still do)." icon={<MessageSquare size={13} />} />
          <div>
            <div className="inline-flex items-center gap-1.5 text-sm font-medium mb-1.5"><Users size={13} /> Group and channel messages</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {GROUP_OPTIONS.map((g) => (
                <button key={g.key} type="button" onClick={() => setGroupAlerts(g.key)} className={cn("text-left rounded-[var(--radius-sm)] border p-3 transition-colors", groupAlerts === g.key ? "border-[var(--brand)] bg-[var(--info-bg)]" : "hover:border-[var(--line-strong)]")}>
                  <div className="flex items-center gap-1.5 text-sm font-medium">{groupAlerts === g.key && <Check size={13} className="text-[var(--brand-2)]" />}{g.key === "mentions" && <AtSign size={12} />}{g.label}</div>
                  <div className="text-[11px] text-muted mt-0.5">{g.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <Toggle checked={batching} onChange={setBatching} label="Fold bursts into one notification" hint="Several messages in the same conversation within two minutes become one notification that counts up, instead of one alert per message." />
          <Toggle checked={previews} onChange={setPreviews} label="Show message previews" hint="Off: pop-ups and desktop notifications show who wrote and where, never what." />
          <Toggle checked={sharedDevice} onChange={setSharedDevice} label="This is a shared device" hint="Desktop notifications show only 'You have a new notification' — nothing a passer-by could read." />
        </div>
      </div>

      {/* Delivery */}
      <div>
        <div className="eyebrow mb-2">Delivery</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button key={m.key} type="button" onClick={() => setMode(m.key)} className={cn("text-left rounded-[var(--radius-sm)] border p-3 transition-colors", mode === m.key ? "border-[var(--brand)] bg-[var(--info-bg)]" : "hover:border-[var(--line-strong)]")}>
              <div className="flex items-center gap-1.5 text-sm font-medium">{mode === m.key && <Check size={13} className="text-[var(--brand-2)]" />}{m.label}</div>
              <div className="text-[11px] text-muted mt-0.5">{m.hint}</div>
            </button>
          ))}
        </div>
        <div className={cn("mt-3", mode === "immediate" && "opacity-60")}>
          <div className="label">Kinds that go to the digest</div>
          <div className="flex flex-wrap gap-1.5">
            {DIGESTABLE.map((k) => {
              const on = digest.has(k.key);
              return (
                <button key={k.key} type="button" disabled={mode === "immediate"} onClick={() => toggleSet(setDigest, k.key)} className={cn("pill pill-lg border transition-colors", on ? "tone-brand border-transparent" : "tone-neutral border-transparent")}>
                  {on && <Check size={11} />} {k.label}
                </button>
              );
            })}
            <span className="pill pill-lg tone-danger opacity-80" title="Always immediate"><BellRing size={11} /> Critical · always immediate</span>
            <span className="pill pill-lg tone-warn opacity-80" title="Always immediate">Action required · always immediate</span>
          </div>
          <div className="text-[11px] text-muted mt-1.5">{mode === "immediate" ? "Switch to a digest to group the kinds above." : "Anything not selected still arrives immediately."}</div>
        </div>
      </div>

      {/* Quiet hours + working hours */}
      <div>
        <div className="eyebrow mb-2">Quiet hours</div>
        <label className="flex items-center gap-2 text-sm mb-2">
          <input type="checkbox" checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} className="accent-[var(--brand)]" />
          Hold non-urgent notifications between
        </label>
        <div className={cn("grid grid-cols-2 gap-3 max-w-xs", !quietOn && "opacity-50")}>
          <Field label="From"><Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} disabled={!quietOn} /></Field>
          <Field label="Until"><Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} disabled={!quietOn} /></Field>
        </div>
        <div className="text-[11px] text-muted mt-1.5">Pop-ups, sounds, push and reminders wait during quiet hours — except <span className="font-medium">urgent</span> and <span className="font-medium">critical</span> items, which always get through. Without quiet hours the company default (21:00–08:00) applies.</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end max-w-lg mt-3">
          <div>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={workOn} onChange={(e) => setWorkOn(e.target.checked)} className="accent-[var(--brand)]" />
              My working hours
            </label>
            <div className={cn("grid grid-cols-2 gap-3", !workOn && "opacity-50")}>
              <Field label="Start"><Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} disabled={!workOn} /></Field>
              <Field label="End"><Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} disabled={!workOn} /></Field>
            </div>
          </div>
          <Field label="Time zone">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="">Company default (Asia/Kolkata)</option>
              {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </Select>
          </Field>
        </div>
        <div className="text-[11px] text-muted mt-1.5">Quiet hours are read on this clock. Working hours are shown to colleagues who message you outside them.</div>
      </div>

      {/* DND */}
      <div>
        <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><MoonStar size={12} /> Do not disturb</div>
        {dndActiveUntil && <div className="text-xs mb-2 pill pill-lg tone-violet"><MoonStar size={11} /> Active until {fmtDate(dndActiveUntil, true)}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-3 items-end max-w-lg">
          <Field label="Silence everything for">
            <Select value={dnd} onChange={(e) => setDnd(e.target.value as DndChoice)}>
              {DND_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </Select>
          </Field>
          {dnd === "custom" && <Field label="Until"><Input type="datetime-local" value={dndCustom} onChange={(e) => setDndCustom(e.target.value)} required /></Field>}
        </div>
        <div className="text-[11px] text-muted mt-1.5">While DND is on your presence shows as Do not disturb and non-urgent notifications wait. You can also toggle it from your avatar menu.</div>
      </div>

      {/* Muted channels */}
      <div>
        <div className="eyebrow mb-2">Muted channels</div>
        {channels.length === 0 ? (
          <div className="text-xs text-muted">No channels to mute yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 max-h-48 overflow-y-auto rounded-[var(--radius-sm)] border p-2">
            {channels.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm min-w-0 px-1 py-0.5 rounded-[var(--radius-sm)] row-hover">
                <input type="checkbox" checked={muted.has(c.id)} onChange={() => toggleSet(setMuted, c.id)} className="accent-[var(--brand)]" />
                <Hash size={12} className="text-muted shrink-0" />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>
        )}
        <div className="text-[11px] text-muted mt-1.5">Muted channels stay in your list and keep their unread count, but raise no pop-up, sound or push — unless a message is marked urgent, critical or asks for acknowledgement. You can also mute from the channel&apos;s own menu.</div>
      </div>

      {/* Priority people */}
      <div>
        <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><Star size={12} /> Priority people</div>
        {priority.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-2">
            {priority.map((id) => (
              <li key={id} className="pill pill-lg tone-neutral">
                <PersonChip id={id} size={16} />
                <button type="button" onClick={() => setPriority((l) => l.filter((x) => x !== id))} className="ml-0.5 hover:text-[var(--danger)]" aria-label="Remove"><X size={11} /></button>
              </li>
            ))}
          </ul>
        )}
        <PersonPicker value="" onChange={(id) => { if (id && !priority.includes(id) && id !== profile.id) setPriority((l) => [...l, id]); }} placeholder="+ Add a person whose messages always reach you" className="max-w-md" />
        <div className="text-[11px] text-muted mt-1.5">Messages and mentions from these people are treated as important: they get past a muted channel, past &quot;mentions only&quot;, and past a digest.</div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}><Save size={15} /> Save preferences</Button>
      </div>
    </form>
  );
}

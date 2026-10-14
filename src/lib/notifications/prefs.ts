"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/utils";

/*
  The signed-in person's notification preferences (`notification_prefs`, own row only), with the
  defaults the database applies when no row exists — so a component can read `prefs.sound`
  before the row has loaded and get the same answer the trigger would.

  Saving happens in NotificationSettings; it announces PREFS_CHANGED so every consumer re-reads
  without a page reload (a layout does not re-render on client navigation).
*/

export type NotifPrefs = Tables<"notification_prefs">;

export const DEFAULT_PREFS: NotifPrefs = {
  user_id: "",
  mode: "immediate",
  digest_kinds: ["information"],
  quiet_start: null,
  quiet_end: null,
  dnd_until: null,
  muted_channels: [],
  priority_people: [],
  updated_at: "",
  sound: true,
  sound_volume: 70,
  desktop: true,
  dm_alerts: true,
  group_alerts: "all",
  previews: true,
  batching: true,
  working_start: null,
  working_end: null,
  timezone: null,
  shared_device: false,
};

export const PREFS_CHANGED = "ghl:notification-prefs-changed";
export function announcePrefsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PREFS_CHANGED));
}

export function useNotificationPrefs(userId: string): { prefs: NotifPrefs; loaded: boolean; reload: () => void } {
  const [prefs, setPrefs] = React.useState<NotifPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const reload = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("notification_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setPrefs(data ? { ...DEFAULT_PREFS, ...data } : { ...DEFAULT_PREFS, user_id: userId });
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [userId, tick]);

  React.useEffect(() => {
    const on = () => reload();
    window.addEventListener(PREFS_CHANGED, on);
    window.addEventListener("focus", on);
    const id = setInterval(on, 5 * 60_000);
    return () => {
      window.removeEventListener(PREFS_CHANGED, on);
      window.removeEventListener("focus", on);
      clearInterval(id);
    };
  }, [reload]);

  return { prefs, loaded, reload };
}

/** Minutes since midnight on the wall clock of `tz` (falls back to the device clock). */
function minutesNow(tz: string | null | undefined, now: Date): number {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
      const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
      const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
      return (h % 24) * 60 + m;
    } catch {
      /* unknown zone: device clock */
    }
  }
  return now.getHours() * 60 + now.getMinutes();
}

function toMin(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Quiet right now? Do-not-disturb, quiet hours, or a presence that says "not now". The same rule
 * the ActivityProvider and the toaster have always used, in one place. Urgent and critical items
 * are decided by the caller — quiet is for chatter.
 */
export function isQuietNow(prefs: NotifPrefs, presence?: string | null, now = new Date()): boolean {
  if (prefs.dnd_until && Date.parse(prefs.dnd_until) > now.getTime()) return true;
  if (presence === "dnd" || presence === "focus") return true;
  const s = toMin(prefs.quiet_start);
  const e = toMin(prefs.quiet_end);
  if (s == null || e == null) return false;
  const cur = minutesNow(prefs.timezone, now);
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

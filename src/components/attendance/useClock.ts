"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { deriveClock, istDay, istDayRange, type AttendanceEvent, type ClockKind, type ClockMode, type ClockSnapshot } from "./attendanceUtils";

export type ClockActionInput = { kind: ClockKind; mode?: ClockMode; note?: string; shareLocation?: boolean };

/**
 * Today's attendance for the signed-in person: loads events, keeps the "hours so far" ticking each minute and
 * stays in sync across tabs through Realtime on `attendance_events` (filtered to my rows — never anyone else's).
 * Location is only captured when the person explicitly asks for it on a specific check-in.
 */
export function useClock() {
  const { profile } = useSession();
  const [events, setEvents] = React.useState<AttendanceEvent[] | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    const { from, to } = istDayRange(istDay());
    const { data } = await createClient()
      .from("attendance_events")
      .select("*")
      .eq("user_id", profile.id)
      .gte("occurred_at", from)
      .lte("occurred_at", to)
      .order("occurred_at");
    setEvents(data || []);
  }, [profile.id]);

  React.useEffect(() => {
    let alive = true;
    const first = setTimeout(() => { reload().catch(() => alive && setEvents([])); }, 0);
    const supabase = createClient();
    const ch = supabase
      .channel(`clock-${profile.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_events", filter: `user_id=eq.${profile.id}` }, () => { reload(); })
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    const onVis = () => { if (document.visibilityState === "visible") { setNow(Date.now()); reload(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearTimeout(first);
      supabase.removeChannel(ch);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [profile.id, reload]);

  const snapshot: ClockSnapshot | null = React.useMemo(() => (events ? deriveClock(events, now) : null), [events, now]);

  const act = React.useCallback(async (input: ClockActionInput): Promise<{ error?: string }> => {
    setBusy(true);
    try {
      let location: { lat: number; lng: number; accuracy: number } | null = null;
      if (input.kind === "clock_in" && input.shareLocation && typeof navigator !== "undefined" && navigator.geolocation) {
        location = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)), accuracy: Math.round(pos.coords.accuracy) }),
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
          );
        });
      }
      const { error } = await createClient().rpc("clock", {
        p_kind: input.kind,
        p_mode: input.mode || snapshot?.mode || "office",
        p_note: input.note?.trim() || undefined,
        p_location: location || undefined,
        p_source: "web",
      });
      if (error) return { error: error.message };
      setNow(Date.now());
      await reload();
      return {};
    } finally {
      setBusy(false);
    }
  }, [reload, snapshot?.mode]);

  return { snapshot, loading: events === null, busy, act, reload, now };
}

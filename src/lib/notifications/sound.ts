"use client";

import type { NotifSound } from "./classify";

/*
  Notification sounds, synthesised with WebAudio so there is nothing to download and nothing that
  can 404. Five distinct patterns: a channel message is one soft note, a direct message two rising
  notes, a mention three quick ones, urgent a double chime, critical an alternating alarm.

  Browsers refuse to make a sound until the page has had a user gesture. `unlockAudio()` listens
  for the first click or key press and resumes the context then — so the first notification after
  a cold load may be silent, which is honest: there is no way to play it. `isSoundReady()` tells
  the toaster whether a sound could be played so it can say "click anywhere to enable sounds".
*/

let ctx: AudioContext | null = null;
let unlockedByGesture = false;
let listening = false;
let lastPlay = 0;

type Ctor = typeof AudioContext;
function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext || w.webkitAudioContext || null;
}

function get(): AudioContext | null {
  if (ctx) return ctx;
  const C = audioCtor();
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function isSoundReady(): boolean {
  const c = get();
  return !!c && (c.state === "running" || unlockedByGesture);
}

/** Call once from a component that lives for the whole session. Registers the gesture listeners. */
export function unlockAudio(): () => void {
  if (typeof window === "undefined" || listening) return () => {};
  listening = true;
  const resume = () => {
    const c = get();
    if (!c) return;
    unlockedByGesture = true;
    if (c.state !== "running") c.resume().catch(() => {});
  };
  const opts: AddEventListenerOptions = { passive: true, capture: true };
  window.addEventListener("pointerdown", resume, opts);
  window.addEventListener("keydown", resume, opts);
  window.addEventListener("touchstart", resume, opts);
  return () => {
    listening = false;
    window.removeEventListener("pointerdown", resume, opts);
    window.removeEventListener("keydown", resume, opts);
    window.removeEventListener("touchstart", resume, opts);
  };
}

function note(c: AudioContext, freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

const PATTERNS: Record<NotifSound, (c: AudioContext, t: number, g: number) => number> = {
  channel: (c, t, g) => {
    note(c, 880, t, 0.16, g);
    return 0.2;
  },
  dm: (c, t, g) => {
    note(c, 659, t, 0.12, g);
    note(c, 880, t + 0.13, 0.18, g);
    return 0.35;
  },
  mention: (c, t, g) => {
    note(c, 784, t, 0.09, g, "triangle");
    note(c, 988, t + 0.1, 0.09, g, "triangle");
    note(c, 1175, t + 0.2, 0.16, g, "triangle");
    return 0.4;
  },
  urgent: (c, t, g) => {
    note(c, 523, t, 0.16, g * 1.2, "triangle");
    note(c, 659, t + 0.17, 0.16, g * 1.2, "triangle");
    note(c, 523, t + 0.42, 0.16, g * 1.2, "triangle");
    note(c, 659, t + 0.59, 0.22, g * 1.2, "triangle");
    return 0.85;
  },
  critical: (c, t, g) => {
    for (let i = 0; i < 3; i++) {
      note(c, 880, t + i * 0.34, 0.15, g * 1.5, "square");
      note(c, 660, t + i * 0.34 + 0.16, 0.15, g * 1.5, "square");
    }
    return 1.05;
  },
};

/**
 * Play one pattern at a volume from 0 to 100. Returns false when nothing could be played (muted,
 * no gesture yet, unsupported) so the caller can decide whether to say so.
 *
 * Throttled: one sound per 2.5 s, whatever arrives, except critical which always sounds. Three
 * people replying in a row should feel like one event, not a drum roll.
 */
export function playNotificationSound(kind: NotifSound, volume = 70): boolean {
  if (volume <= 0) return false;
  const c = get();
  if (!c) return false;
  if (c.state !== "running") {
    if (!unlockedByGesture) return false;
    c.resume().catch(() => {});
    if ((c.state as AudioContextState) !== "running") return false;
  }
  const now = Date.now();
  if (kind !== "critical" && now - lastPlay < 2500) return true;
  lastPlay = now;
  const gain = Math.pow(Math.min(100, volume) / 100, 2) * 0.28;
  try {
    PATTERNS[kind](c, c.currentTime + 0.01, gain);
    return true;
  } catch {
    return false;
  }
}

/** For the "Play test" button in settings — bypasses the throttle on purpose. */
export function previewSound(kind: NotifSound, volume = 70): boolean {
  lastPlay = 0;
  const c = get();
  if (c && c.state !== "running") {
    unlockedByGesture = true;
    c.resume().catch(() => {});
  }
  return playNotificationSound(kind, volume);
}

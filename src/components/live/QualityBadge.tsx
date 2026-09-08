"use client";
/** Connection quality (§9) + the reconnecting banner (§10, §153). */
import * as React from "react";
import { Signal, SignalHigh, SignalLow, WifiOff } from "lucide-react";
import { Pill } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { QualityLevel } from "@/lib/live/types";

const LABEL: Record<QualityLevel, string> = { excellent: "Excellent", good: "Good", weak: "Weak" };
const TONE: Record<QualityLevel, string> = { excellent: "tone-success", good: "tone-info", weak: "tone-warn" };

export function QualityDot({ level, className }: { level: QualityLevel; className?: string }) {
  return (
    <span
      className={cn("inline-block w-1.5 h-1.5 rounded-full", className)}
      title={`Connection: ${LABEL[level]}`}
      style={{ background: level === "excellent" ? "var(--success)" : level === "good" ? "var(--info)" : "var(--warn)" }}
    />
  );
}

export function QualityBadge({ level, className }: { level: QualityLevel; className?: string }) {
  const Icon = level === "excellent" ? SignalHigh : level === "good" ? Signal : SignalLow;
  return (
    <Pill tone={TONE[level]} className={cn("gap-1", className)}>
      <Icon size={12} /> {LABEL[level]}
    </Pill>
  );
}

export function ConnectionBanner({ state }: { state: "reconnecting" | "connected" | "offline" }) {
  if (state === "connected") return null;
  return (
    <div className={cn("flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium", state === "offline" ? "tone-danger" : "tone-warn")}>
      <WifiOff size={13} />
      {state === "offline" ? "Disconnected — trying to get you back in…" : "Connection lost. Reconnecting…"}
    </div>
  );
}

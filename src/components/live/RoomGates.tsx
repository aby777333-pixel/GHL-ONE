"use client";
/**
 * Everything that can happen instead of a room: waiting for the host, the room ended,
 * no access (→ Request access), media not configured, or a plain failure to connect.
 * A person should never meet a raw error here.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, DoorOpen, Loader2, Lock, VideoOff } from "lucide-react";
import { Button, Card, EmptyState, Spinner } from "@/components/ui";
import { RequestAccessForm } from "@/components/access/RequestAccess";
import { cn } from "@/lib/utils";
import type { JoinState } from "./useLiveKit";

function Gate({ icon, tone, title, hint, backHref, children }: { icon: React.ReactNode; tone: string; title: string; hint: string; backHref: string; children?: React.ReactNode }) {
  return (
    <div className="page page-narrow anim-fade-up">
      <Card className="p-[var(--s5)]">
        <EmptyState
          icon={<span className={cn("flex items-center justify-center", tone)}>{icon}</span>}
          title={title}
          hint={hint}
          action={
            <div className="flex items-center gap-2">
              {children}
              <a href={backHref} className="btn btn-secondary btn-sm">Back to GHL LIVE</a>
            </div>
          }
        />
      </Card>
    </div>
  );
}

/** Returns null when the state is "connected" — the caller then renders the room. */
export function RoomGate({
  state,
  error,
  title,
  roomId,
  guest,
  backHref,
  onRetry,
}: {
  state: JoinState;
  error: string | null;
  title: string;
  roomId?: string;
  guest?: boolean;
  backHref: string;
  onRetry: () => void;
}) {
  const router = useRouter();

  if (state === "disabled")
    return (
      <Gate
        icon={<VideoOff size={22} />}
        tone="text-warn"
        title="Live media is not switched on"
        hint="LiveKit is not configured for this workspace yet, so calls cannot start. The room's notes, tasks and decisions still work from its history."
        backHref={backHref}
      />
    );

  if (state === "ended")
    return (
      <Gate icon={<DoorOpen size={22} />} tone="text-muted" title="This room has ended" hint="The notes, decisions and tasks from it are kept in the room history." backHref={backHref}>
        {roomId && !guest && (
          <Button size="sm" variant="primary" onClick={() => router.push(`/live?room=${roomId}`)}>Open the history</Button>
        )}
      </Gate>
    );

  if (state === "locked")
    return <Gate icon={<Lock size={22} />} tone="text-warn" title="The room is locked" hint="The host has locked this room. Ask them to unlock it, then open your link again." backHref={backHref} />;

  if (state === "waiting")
    return (
      <Gate
        icon={<Loader2 size={22} className="animate-spin" />}
        tone="text-info"
        title="Waiting for the host"
        hint="You are in the waiting room. The moment the host admits you, you will join automatically."
        backHref={backHref}
      >
        <span className="text-xs text-muted">Checking every few seconds…</span>
      </Gate>
    );

  if (state === "denied")
    return (
      <div className="page page-narrow anim-fade-up">
        <Card className="p-[var(--s5)]">
          <div className="flex items-start gap-4 mb-[var(--s4)]">
            <span className="w-12 h-12 rounded-[var(--radius)] tone-warn flex items-center justify-center shrink-0"><Lock size={20} /></span>
            <div className="min-w-0">
              <h1 className="h2">You cannot open this room</h1>
              <p className="text-sm text-muted mt-1">It is private to its members, or the invitation has expired. Tell the host why you need to be in it and they can let you in for exactly as long as you need.</p>
            </div>
          </div>
          {roomId && !guest && <RequestAccessForm resource_type="module" resource_id={roomId} resource_label={title} />}
        </Card>
      </div>
    );

  if (state === "error")
    return (
      <Gate icon={<AlertTriangle size={22} />} tone="text-danger" title="Could not join the room" hint={error || "Something went wrong on the way in."} backHref={backHref}>
        <Button size="sm" variant="primary" onClick={onRetry}>Try again</Button>
      </Gate>
    );

  if (state === "connecting" || state === "idle")
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-[var(--s7)]">
        <Spinner className="w-6 h-6" />
        <div className="text-sm text-muted">Joining {title}…</div>
      </div>
    );

  return null;
}

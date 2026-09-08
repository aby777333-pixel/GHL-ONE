"use client";
/**
 * External guest entry (§160). Name → join → the same room canvas in "guest" mode:
 * no company navigation, no chat, notes, tasks or AI — only the call, and an
 * "External Guest" badge everywhere the guest appears.
 */
import * as React from "react";
import { ShieldCheck, Video } from "lucide-react";
import { Button, Card, Field, Input, ToastProvider } from "@/components/ui";
import { LiveRoom } from "./LiveRoom";

export function GuestJoin({ token }: { token: string }) {
  const [name, setName] = React.useState(() => {
    try {
      return typeof window === "undefined" ? "" : localStorage.getItem("ghl-guest-name") || "";
    } catch {
      return ""; // private mode
    }
  });
  const [joined, setJoined] = React.useState(false);

  if (joined) {
    return (
      <ToastProvider>
        <div className="min-h-dvh flex flex-col">
          <div className="flex items-center gap-2 px-3 h-11 border-b bg-[var(--bg-elev)] shrink-0">
            <span className="w-6 h-6 rounded-[var(--radius-sm)] tone-brand flex items-center justify-center text-[11px] font-bold">G</span>
            <span className="text-sm font-medium">GHL ONE · Live</span>
            <span className="pill tone-warn ml-auto">External Guest</span>
          </div>
          <div className="flex-1 min-h-0">
            <LiveRoom guestToken={token} guestName={name.trim() || "Guest"} guest backHref="/" />
          </div>
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-dvh flex items-center justify-center p-[var(--s4)]">
        <Card className="w-full max-w-md p-[var(--s5)]">
          <div className="flex items-center gap-3 mb-[var(--s4)]">
            <span className="w-11 h-11 rounded-[var(--radius)] tone-brand flex items-center justify-center"><Video size={20} /></span>
            <div>
              <h1 className="h2">Join the call</h1>
              <p className="text-sm text-muted">You have been invited to a GHL ONE live room as an external guest.</p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim();
              if (!n) return;
              try {
                localStorage.setItem("ghl-guest-name", n);
              } catch {
                /* private mode */
              }
              setJoined(true);
            }}
            className="space-y-[var(--s3)]"
          >
            <Field label="Your name" hint="Everyone in the room sees this next to an “External Guest” badge.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Nair — Acme" autoFocus maxLength={60} required />
            </Field>
            <Button type="submit" variant="primary" className="w-full" disabled={!name.trim()}>Join the room</Button>
          </form>

          <div className="mt-[var(--s4)] rounded-[var(--radius-sm)] border px-3 py-2.5 flex items-start gap-2">
            <ShieldCheck size={15} className="text-muted mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted">
              You will only see and hear this call. No company data, files, chat or people directory is shared with guests, and your microphone and camera stay off until you switch them on.
            </p>
          </div>
        </Card>
      </div>
    </ToastProvider>
  );
}

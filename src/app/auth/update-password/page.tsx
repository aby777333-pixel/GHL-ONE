"use client";

/*
  Choose a new password — where a password-reset email leads (via /auth/callback, which has already turned
  the link into a session). There was no reset flow at all: anyone who forgot their password had no way
  back in. Outside the app shell (under /auth, which the proxy leaves public), so messages are inline.
*/

import * as React from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export default function UpdatePasswordPage() {
  const [state, setState] = React.useState<"checking" | "ready" | "no-session">("checking");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    createClient().auth.getUser().then(({ data }) => { if (alive) setState(data.user ? "ready" : "no-session"); });
    return () => { alive = false; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) return setErr("Use at least 8 characters.");
    if (password !== confirm) return setErr("The two passwords do not match.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setErr(error.message);
    // Full navigation, as after sign-in: the proxy and server render must see the session on a fresh request.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] card p-[var(--s4)]">
        <div className="w-11 h-11 rounded-full sunken inline-flex items-center justify-center text-[var(--brand-2)] mb-[var(--s3)]"><KeyRound size={20} /></div>
        <div className="h2 mb-1">Choose a new password</div>
        {state === "checking" ? (
          <div className="text-sm text-muted">One moment…</div>
        ) : state === "no-session" ? (
          <>
            <p className="text-sm text-muted">This reset link has expired or was opened in a different browser. Request a new one from the sign-in page and open it on this device.</p>
            <Link href="/login?reset=1" className="btn btn-primary w-full mt-[var(--s4)]">Back to sign in</Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3 mt-3">
            <Field label="New password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></Field>
            <Field label="Confirm new password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" /></Field>
            {err && <div className="text-sm text-danger" role="alert">{err}</div>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Save password and continue</Button>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MailCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { Suspense } from "react";

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  /*
    Signing up used to leave the whole registration form on screen with a one-line "check your
    email" note tucked underneath it, so it read as if nothing had happened. The confirmation is
    its own screen, and it is the only thing on it:  Create account → Check your email → Sign in.
  */
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setErr(error.message);
      // Full navigation: the session cookie must reach the edge proxy and server render on a fresh request.
      window.location.assign(next.startsWith("/") ? next : "/");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      setLoading(false);
      if (error) return setErr(error.message);
      if (data.session) {
        // Same full navigation as sign-in above: `router.push` would soft-navigate before the new
        // session cookie has been seen by the proxy and the server render.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      } else {
        setSentTo(email);
      }
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 relative overflow-hidden">
      {/*
        The office photo sits behind the card. It is decorative, so it carries no alt text.
        The scrim on top is deliberately dark in BOTH themes: the copy outside the card has no
        surface of its own, and a theme-following scrim would leave white text on a bright photo
        in light mode. The card keeps its own solid background, so the form stays legible either way.
      */}
      <div className="absolute inset-0 -z-10">
        <Image src="/login-bg.webp" alt="" fill priority sizes="100vw" className="object-cover object-center" />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(2,6,23,0.66) 0%, rgba(2,6,23,0.5) 38%, rgba(2,6,23,0.74) 100%)" }}
        />
      </div>
      <div className="w-full max-w-[400px] anim-fade-up">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center text-white font-bold text-lg" style={{ background: "linear-gradient(135deg, var(--brand), #0f172a)", boxShadow: "0 6px 20px rgba(0,0,0,.35)" }}>G</div>
          <div>
            <div className="text-lg font-semibold leading-tight text-white">GHL ONE</div>
            <div className="text-xs text-white/75">One Company. One Workspace. One Source of Truth.</div>
          </div>
        </div>
        <div className="card p-[var(--s4)]" style={{ boxShadow: "0 24px 60px rgba(2,6,23,.45), var(--shadow-lg)" }}>
        {sentTo ? (
          <div className="text-center py-[var(--s2)]">
            <div className="w-12 h-12 rounded-full sunken inline-flex items-center justify-center text-[var(--success)] mb-[var(--s3)]">
              <MailCheck size={22} />
            </div>
            <div className="h2 mb-1">Check your email</div>
            <p className="text-sm text-muted">
              We sent a confirmation link to <span className="font-medium text-[var(--fg)] break-all">{sentTo}</span>. Open it to
              activate your account, then sign in.
            </p>
            <p className="text-xs text-muted mt-3">
              Nothing arrived? Give it a minute and check your spam folder. New accounts also wait for admin activation
              unless you were pre-invited.
            </p>
            <Button
              variant="primary"
              size="lg"
              className="w-full mt-[var(--s4)]"
              onClick={() => { setSentTo(null); setMode("signin"); setPassword(""); setName(""); }}
            >
              Back to sign in
            </Button>
          </div>
        ) : (
          <>
          <div className="h2 mb-1">{mode === "signin" ? "Sign in" : "Create your account"}</div>
          <div className="text-sm text-muted mb-5">{mode === "signin" ? "Use your GHL India Ventures work email." : "New accounts wait for admin activation unless pre-invited."}</div>
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field label="Full name">
                <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" autoComplete="name" />
              </Field>
            )}
            <Field label="Work email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="email" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="••••••••" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            </Field>
            {err && <div className="text-sm text-danger">{err}</div>}
            <Button type="submit" variant="primary" size="lg" className="w-full mt-2" loading={loading}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <div className="text-sm text-muted mt-4 text-center">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button className="link" onClick={() => setMode("signup")}>Create an account</button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button className="link" onClick={() => setMode("signin")}>Sign in</button>
              </>
            )}
          </div>
          </>
        )}
        </div>
        <div className="text-[11px] text-muted text-center mt-6">GHL India Ventures · Internal system. Authorised personnel only.</div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";
import { Suspense } from "react";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setErr(error.message);
      router.replace(next);
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      setLoading(false);
      if (error) return setErr(error.message);
      if (data.session) {
        router.replace("/");
        router.refresh();
      } else {
        setInfo("Check your email to confirm your account, then sign in.");
      }
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(1200px 600px at 20% -10%, color-mix(in oklab, var(--brand) 18%, transparent), transparent 60%), radial-gradient(800px 500px at 100% 100%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 60%)" }} />
      <div className="w-full max-w-[400px] anim-fade-up">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center text-white font-bold text-lg" style={{ background: "linear-gradient(135deg, var(--brand), #0f172a)" }}>G</div>
          <div>
            <div className="text-lg font-semibold leading-tight">GHL ONE</div>
            <div className="text-xs text-muted">One Company. One Workspace. One Source of Truth.</div>
          </div>
        </div>
        <div className="card p-[var(--s4)]" style={{ boxShadow: "var(--shadow)" }}>
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
            {info && <div className="text-sm text-success">{info}</div>}
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

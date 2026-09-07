import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_active, full_name").eq("id", user.id).maybeSingle();
  if (profile?.is_active) redirect("/");

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="card p-[var(--s5)] max-w-md w-full text-center anim-fade-up">
        <div className="w-14 h-14 rounded-full tone-warn mx-auto flex items-center justify-center text-2xl mb-4">⏳</div>
        <div className="h2 mb-2">Account awaiting activation</div>
        <p className="text-sm text-muted">
          Hi {profile?.full_name || user.email}. Your GHL ONE account has been created and is waiting for an administrator to assign your department and role. You will get access as soon as it is activated.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/auth/signout" className="btn btn-secondary">Sign out</Link>
          <Link href="/" className="btn btn-primary">Check again</Link>
        </div>
      </div>
    </div>
  );
}

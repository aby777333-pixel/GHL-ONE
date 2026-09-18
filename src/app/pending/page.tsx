import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JoinRequestForm, type JoinRequestRow } from "@/components/auth/JoinRequestForm";

export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_active, full_name, org_id").eq("id", user.id).maybeSingle();
  if (profile?.is_active) redirect("/");

  /*
    A sign-up used to end here and go no further: nobody was told, and the person had no way of
    saying which department they belong to. Both are fixed — the form below files the request and
    `request_account_activation` notifies the department head and the company administrators.
    Departments are readable to a pending account (dept_read is org-scoped, not member-scoped);
    the request itself is readable only to them and to whoever may approve it.
  */
  const [{ data: departments }, { data: request }, org] = await Promise.all([
    supabase.from("departments").select("id, name").order("position"),
    supabase.from("join_requests").select("id, department_id, designation, note, status, decision_note, decided_label").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    profile?.org_id
      ? supabase.from("organizations").select("name").eq("id", profile.org_id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="card p-[var(--s5)] max-w-md w-full text-center anim-fade-up">
        <div className="w-14 h-14 rounded-full tone-warn mx-auto flex items-center justify-center text-2xl mb-4">⏳</div>
        <div className="h2 mb-2">Account awaiting approval</div>
        <p className="text-sm text-muted">
          Hi {profile?.full_name || user.email}. Your GHL ONE account has been created. Tell us which department you
          work in and the people who can admit you — your department head, HR and the company administrators — are
          notified straight away.
        </p>
        <div className="mt-[var(--s4)]">
          <JoinRequestForm
            departments={(departments || []) as { id: string; name: string }[]}
            request={(request as JoinRequestRow | null) ?? null}
            company={org?.name ?? null}
          />
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/auth/signout" className="btn btn-secondary">Sign out</Link>
          <Link href="/" className="btn btn-primary">Check again</Link>
        </div>
      </div>
    </div>
  );
}

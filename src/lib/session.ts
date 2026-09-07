import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/utils";

export type Session = {
  userId: string;
  email: string;
  profile: Profile;
};

/** Load the signed-in user and their profile. Redirects to /login or /pending as needed. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/pending");
  if (!profile.is_active) redirect("/pending");
  return { userId: user.id, email: user.email || profile.email, profile };
});

export const getSessionOptional = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) return null;
  return { userId: user.id, email: user.email || profile.email, profile };
});

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
  // A frozen (suspended) person keeps is_active but every RLS read already refuses them; show them
  // their status instead of an empty shell. /pending only sends back here for status "active".
  if (profile.frozen) redirect("/pending");
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

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/*
  Where an email link lands (sign-up confirmation, password reset). The code is exchanged for a session,
  then the person continues to `next`.

  - `next` must be a path inside this app. It used to accept any URL, so a crafted link could bounce a
    freshly signed-in person to another site. Anything else falls back to "/".
  - A password-reset link is sent to /auth/update-password to choose the new password, even when the
    email arrived via the project's Site URL rather than the redirect we asked for: the user's
    `recovery_sent_at` says a reset was requested in the last hour.
*/
function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    const sent = data?.user?.recovery_sent_at ? Date.parse(data.user.recovery_sent_at) : 0;
    if (sent && Date.now() - sent < 60 * 60_000) next = "/auth/update-password";
  }
  return NextResponse.redirect(new URL(next, request.url));
}

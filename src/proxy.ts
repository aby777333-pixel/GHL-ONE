import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { matchScreen, type Screen } from "@/lib/screens";

// `/live/guest/<token>` is an external-guest capability link: the token itself is the
// credential (validated by `live_guest_lookup`), so the page and the token endpoint must be
// reachable without a company session. Nothing else under /live is public.
const PUBLIC_PATHS = ["/login", "/auth", "/pending", "/live/guest"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!user && pathname.startsWith("/api/")) {
    // Token-authenticated public endpoints (personal calendar feed, incoming webhooks) and the harmless status probe.
    if (pathname === "/api/ai/status" || pathname.startsWith("/api/hooks/") || pathname.startsWith("/api/calendar/")) return response;
    // Guest join: the route itself requires a valid guest token and returns 401 for member joins.
    if (pathname === "/api/live/token") return response;
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Screen governance — server-side, never only hidden menu items. Precedence lives in effective_screens().
  if (user && !isPublic && !pathname.startsWith("/api/") && pathname !== "/no-access") {
    const { data } = await supabase.rpc("effective_screens");
    const screens = (data || []) as Screen[];
    const screen = matchScreen(screens, pathname);
    if (screen && !screen.allowed) {
      await supabase.rpc("log_access_event", { p_kind: "denied", p_type: "screen", p_id: null, p_path: pathname, p_details: { screen: screen.key, source: screen.source } });
      const url = request.nextUrl.clone();
      url.pathname = "/no-access";
      url.search = "";
      url.searchParams.set("screen", screen.key);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

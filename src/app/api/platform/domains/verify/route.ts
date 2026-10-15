import { NextResponse } from "next/server";
import { resolveTxt } from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/domains/verify  { id }
 *
 * Proves a company owns an email domain (0078): looks for `ghl-one-verify=<token>` in the TXT records
 * of the domain or of `_ghl-one.<domain>`, and only then records the verification. Runs under the
 * caller's own session: the domain row is readable only by a platform owner (cd_owner_read), and
 * `verify_company_domain()` re-checks ownership — this route adds the DNS evidence, not authority.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: role } = await supabase.rpc("platform_role");
  if (role !== "platform_super_admin") return NextResponse.json({ error: "Only a platform owner can verify a domain." }, { status: 403 });

  let id = "";
  try {
    id = String(((await req.json()) as { id?: string }).id || "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid domain id" }, { status: 400 });

  const { data: row, error } = await supabase.from("company_domains").select("id, domain, verification_token").eq("id", id).maybeSingle();
  if (error || !row) return NextResponse.json({ error: error?.message || "No such domain" }, { status: 404 });

  const expected = `ghl-one-verify=${row.verification_token}`;
  const hosts = [row.domain, `_ghl-one.${row.domain}`];
  const seen: string[] = [];
  let foundAt: string | null = null;
  for (const host of hosts) {
    try {
      const records = await resolveTxt(host);
      for (const parts of records) {
        const txt = parts.join("");
        seen.push(txt.length > 120 ? `${txt.slice(0, 117)}…` : txt);
        if (txt.trim() === expected) foundAt = host;
      }
    } catch {
      // NXDOMAIN / no TXT records: simply not found at this host.
    }
    if (foundAt) break;
  }

  if (!foundAt) return NextResponse.json({ found: false, checked: hosts, records: seen.slice(0, 10) });

  const { error: vErr } = await supabase.rpc("verify_company_domain", { p_id: row.id, p_method: "dns", p_note: `TXT record found at ${foundAt}` });
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });
  return NextResponse.json({ found: true, checked: hosts, records: seen.slice(0, 10) });
}

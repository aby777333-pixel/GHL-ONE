import { getSession } from "@/lib/session";
import { SearchClient } from "./SearchClient";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getSession();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  return <SearchClient initialQuery={q} initialKind={kind} />;
}

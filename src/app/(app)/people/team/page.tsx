import { getSession } from "@/lib/session";
import { TeamPageTabs } from "@/components/people/TeamPageTabs";

export const metadata = { title: "My team" };

/** Manager's team view — roster (`reports_of`), async standup digest (`team_digest`) and 7-day capacity (`capacity_calendar`). */
export default async function MyTeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, sp] = await Promise.all([getSession(), searchParams]);
  return <TeamPageTabs tab={typeof sp.tab === "string" ? sp.tab : undefined} />;
}

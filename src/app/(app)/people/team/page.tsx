import { getSession } from "@/lib/session";
import { MyTeam } from "@/components/admin/people/ReportingTree";

export const metadata = { title: "My team" };

/** Manager's team view — direct + indirect reports (`reports_of`), today's attendance, open work, blockers and requests. */
export default async function MyTeamPage() {
  await getSession();
  return <MyTeam standalone />;
}

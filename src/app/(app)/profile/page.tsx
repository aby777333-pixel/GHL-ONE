import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * `/profile` — your own profile.
 *
 * The route did not exist, and things linked to it: `notify_account_change()` sends "Your account
 * has been approved" / "reactivated" / "deactivated" with `link = '/profile'`, so the notification
 * a person gets about their own account led to a 404. `screens.ts` has always listed `/profile`
 * among the ungoverned paths, which says the route was meant to be there.
 *
 * A person's profile is `/people/<their id>` — the same page everyone else sees, which is the
 * point: there is no separate private version of it, and the Privacy Center lives inside it. So
 * this redirects rather than rendering a second copy, and every existing link starts working
 * without touching the notifications that were already sent.
 */
export default async function MyProfilePage() {
  const { userId } = await getSession();
  redirect(`/people/${userId}`);
}

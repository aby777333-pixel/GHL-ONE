import type { Json } from "@/lib/database.types";
import type { Enums } from "@/lib/utils";

export type ChannelType = Enums<"channel_type">;

/** Channel visibility (stored as text in `channels.visibility`). */
export type Visibility = "company_open" | "department_open" | "invite_only" | "private" | "confidential" | "executive_only";
export const VISIBILITIES: Visibility[] = ["company_open", "department_open", "invite_only", "private", "confidential", "executive_only"];

export const VISIBILITY_META: Record<Visibility, { label: string; short: string; who: string; tone: string; icon: "globe" | "building" | "users" | "lock" | "shield" | "crown" }> = {
  company_open: { label: "Company-open", short: "Company", who: "Everyone in the company can find, read and join this room.", tone: "tone-success", icon: "globe" },
  department_open: { label: "Department", short: "Department", who: "People in the linked department(s) can find and read it. Others need an invitation.", tone: "tone-violet", icon: "building" },
  invite_only: { label: "Invite-only", short: "Invite", who: "Only invited members can read it. Members can bring other people in.", tone: "tone-info", icon: "users" },
  private: { label: "Private", short: "Private", who: "Hidden from search. Only members see that it exists.", tone: "tone-neutral", icon: "lock" },
  confidential: { label: "Confidential", short: "Confidential", who: "Hidden and restricted. Only the owner or co-owner can bring people in.", tone: "tone-warn", icon: "shield" },
  executive_only: { label: "Executive-only", short: "Executive", who: "Executives and above, plus explicitly invited members.", tone: "tone-danger", icon: "crown" },
};

export function asVisibility(v?: string | null): Visibility {
  return (VISIBILITIES as string[]).includes(v || "") ? (v as Visibility) : "invite_only";
}

/** Room types a person can create from GHL Common. `management` is admin-only. */
export type RoomType = Extract<ChannelType, "group" | "temporary" | "team" | "social" | "client" | "vendor" | "management">;
export const ROOM_TYPES: RoomType[] = ["group", "temporary", "team", "social", "client", "vendor", "management"];
export const ROOM_TYPE_META: Record<RoomType, { label: string; hint: string }> = {
  group: { label: "Group", hint: "A working group around a topic or initiative." },
  temporary: { label: "Temporary room", hint: "Short-lived. Archives itself on a date you choose." },
  team: { label: "Team", hint: "A standing room for a team inside a department." },
  social: { label: "Social", hint: "Interest groups, celebrations, clubs." },
  client: { label: "Client room", hint: "Coordination around one client. Keep it tidy — guests may be present." },
  vendor: { label: "Vendor room", hint: "Coordination with an external vendor." },
  management: { label: "Management", hint: "Leadership-only coordination. Admins can create these." },
};
export const GROUP_TYPES: ChannelType[] = ["group", "temporary", "team", "social", "client", "vendor", "management"];

/** `channels.settings` shape. */
export type ChannelSettings = { post: "members" | "owners"; invite: "members" | "owners"; share_files: boolean; guests: boolean };
export const DEFAULT_SETTINGS: ChannelSettings = { post: "members", invite: "members", share_files: true, guests: false };

export function parseSettings(j: Json | null | undefined): ChannelSettings {
  if (!j || typeof j !== "object" || Array.isArray(j)) return DEFAULT_SETTINGS;
  const o = j as Record<string, Json | undefined>;
  return {
    post: o.post === "owners" ? "owners" : "members",
    invite: o.invite === "owners" ? "owners" : "members",
    share_files: o.share_files !== false,
    guests: o.guests === true,
  };
}

/** Human countdown to an ISO timestamp ("3 days", "5 hours", "expired"). */
export function untilLabel(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "expired";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

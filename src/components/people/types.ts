import type { Profile } from "@/lib/utils";

export type DirectoryPerson = Pick<Profile,
  "id" | "full_name" | "avatar_url" | "designation" | "department_id" | "team_id" | "manager_id" | "role" | "presence" | "status_text" | "skills" | "email" | "phone" | "timezone" | "is_external" | "joined_at"
>;

export const DIRECTORY_SELECT = "id,full_name,avatar_url,designation,department_id,team_id,manager_id,role,presence,status_text,skills,email,phone,timezone,is_external,joined_at";

export const PRESENCE_LABEL: Record<Profile["presence"], string> = {
  available: "Available", busy: "Busy", in_meeting: "In a meeting", dnd: "Do not disturb", away: "Away", offline: "Offline", leave: "On leave",
};
export const PRESENCE_TONE: Record<Profile["presence"], string> = {
  available: "tone-success", busy: "tone-danger", in_meeting: "tone-violet", dnd: "tone-danger", away: "tone-warn", offline: "tone-muted", leave: "tone-warn",
};
export const PRESENCE_OPTIONS: Profile["presence"][] = ["available", "busy", "in_meeting", "dnd", "away", "offline"];

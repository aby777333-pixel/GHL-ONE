/** Organization Control tabs — plain module so server pages can parse the `tab` search param. */
export type OrgTab = "people" | "structure" | "roles" | "screens" | "permissions" | "health" | "policies" | "activity" | "audit" | "config" | "emergency" | "sessions";
export const ORG_TABS: OrgTab[] = ["health", "people", "structure", "roles", "screens", "permissions", "policies", "emergency", "sessions", "config", "activity", "audit"];
export function asOrgTab(v: unknown): OrgTab {
  return typeof v === "string" && (ORG_TABS as string[]).includes(v) ? (v as OrgTab) : "health";
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ListPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Pill, useToast } from "@/components/ui";
import { cn, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import type { SecurityRole } from "./useSecurityRoles";

/**
 * `profiles.role` — where someone sits in the chain of command. It is not their job title (that is
 * `designation`) and it is not a security role (those are `system_roles`, held through
 * `user_roles`). Three separate ideas that used to read as one word; the tooltip says which.
 */
export function RolePill({ role, size }: { role: RoleLevel; size?: "lg" }) {
  const tone = role === "super_admin" || role === "director" ? "tone-brand" : role === "executive" || role === "department_head" ? "tone-violet" : role === "manager" || role === "team_lead" ? "tone-info" : role === "consultant" || role === "vendor" || role === "guest" ? "tone-muted" : "tone-neutral";
  return <Pill tone={tone} size={size} title={`Access level: ${ROLE_LABEL[role]}. Job title and security roles are set separately.`}>{ROLE_LABEL[role]}</Pill>;
}

/** Opens (or creates) a DM and navigates to it. */
export function ChatButton({ userId, size = "sm", variant = "secondary", label = "Chat", className }: { userId: string; size?: "xs" | "sm" | "md"; variant?: "primary" | "secondary" | "ghost"; label?: string; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  async function go(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    const { data, error } = await createClient().rpc("open_dm", { other: userId });
    setBusy(false);
    if (error || !data) { toast.push(error?.message || "Could not open chat", "danger"); return; }
    router.push(`/chat/${data}`);
  }
  return (
    <Button size={size} variant={variant} onClick={go} loading={busy} className={className}>
      <MessageSquare size={14} /> {label}
    </Button>
  );
}

export function AssignTaskButton({ userId, size = "sm", variant = "ghost", className }: { userId: string; size?: "xs" | "sm" | "md"; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  const router = useRouter();
  return (
    <Button size={size} variant={variant} className={className} onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/tasks?new=1&assignee=${userId}`); }}>
      <ListPlus size={14} /> Assign task
    </Button>
  );
}

/**
 * The security roles a person holds, labelled so they cannot be misread as a job title.
 *
 * Renders nothing when the list is empty — which, thanks to RLS on `user_roles`, means either
 * "holds none" or "not visible to you". Neither is worth an empty row, and inventing a
 * "None" label would state the first when it might be the second.
 */
export function AccessRoles({ roles, max = 2, className }: { roles: SecurityRole[] | undefined; max?: number; className?: string }) {
  if (!roles || roles.length === 0) return null;
  const shown = roles.slice(0, max);
  const rest = roles.length - shown.length;
  return (
    <span className={cn("inline-flex items-center gap-1 flex-wrap min-w-0", className)}>
      <span className="text-[10px] uppercase tracking-wider text-muted">Access</span>
      {shown.map((r) => (
        <Pill key={r.id} tone={r.acting ? "tone-warn" : "tone-violet"} title={r.acting ? `Acting: ${r.name}` : r.name}>
          {r.name}{r.acting ? " (acting)" : ""}
        </Pill>
      ))}
      {rest > 0 && <Pill tone="tone-muted" title={roles.slice(max).map((r) => r.name).join(", ")}>+{rest}</Pill>}
    </span>
  );
}

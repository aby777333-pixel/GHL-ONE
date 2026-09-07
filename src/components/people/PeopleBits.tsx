"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ListPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Pill, useToast } from "@/components/ui";
import { ROLE_LABEL, type RoleLevel } from "@/lib/utils";

export function RolePill({ role, size }: { role: RoleLevel; size?: "lg" }) {
  const tone = role === "super_admin" || role === "director" ? "tone-brand" : role === "executive" || role === "department_head" ? "tone-violet" : role === "manager" || role === "team_lead" ? "tone-info" : role === "consultant" || role === "vendor" || role === "guest" ? "tone-muted" : "tone-neutral";
  return <Pill tone={tone} size={size}>{ROLE_LABEL[role]}</Pill>;
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

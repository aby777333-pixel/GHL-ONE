"use client";

import { Building2, Crown, Eye, Lock, Shield, Users } from "lucide-react";
import { Avatar } from "@/components/ui";
import { usePerson } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import { asVisibility, VISIBILITY_META, type Visibility } from "@/components/common/visibility";

const ICON: Record<Visibility, React.ReactNode> = {
  company_open: <Eye size={11} />, department_open: <Building2 size={11} />, invite_only: <Users size={11} />, private: <Lock size={11} />, confidential: <Shield size={11} />, executive_only: <Crown size={11} />,
};

/** Small pill that says who can see a channel. Label collapses to the icon on narrow screens. */
export function VisibilityPill({ visibility, className }: { visibility?: string | null; className?: string }) {
  const v = asVisibility(visibility);
  const m = VISIBILITY_META[v];
  return (
    <span className={cn("pill shrink-0", m.tone, className)} title={`Who can see this: ${m.who}`} aria-label={`${m.label}. ${m.who}`}>
      {ICON[v]}
      <span className="hidden sm:inline">{m.label}</span>
    </span>
  );
}

/** Tiny owner chip for a channel header. */
export function OwnerChip({ id, className }: { id?: string | null; className?: string }) {
  const p = usePerson(id);
  if (!p) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] text-muted shrink-0", className)} title={`Owner: ${p.full_name}`}>
      <Avatar name={p.full_name} src={p.avatar_url} size={14} />
      <span className="hidden md:inline truncate max-w-[110px]">{p.full_name.split(" ")[0]}</span>
    </span>
  );
}

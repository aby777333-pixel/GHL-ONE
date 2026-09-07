"use client";

import * as React from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { Pill } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { cn, APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE, CLASSIFICATION_LABEL, type ApprovalStatus, type Classification } from "@/lib/utils";
import { FileTypeIcon, groupTone, mimeGroup, signedUrl, type MimeGroup } from "./storage";

export function ClassificationPill({ value, size }: { value: Classification; size?: "lg" }) {
  const locked = value === "confidential" || value === "highly_confidential" || value === "board_only";
  const tone = value === "board_only" ? "tone-danger" : value === "highly_confidential" ? "tone-orange" : value === "confidential" ? "tone-warn" : value === "public" ? "tone-success" : "tone-neutral";
  return (
    <Pill tone={tone} size={size}>
      {value === "board_only" ? <ShieldAlert size={10} /> : locked ? <Lock size={10} /> : null}
      {CLASSIFICATION_LABEL[value]}
    </Pill>
  );
}

export function ApprovalPill({ value, size }: { value: ApprovalStatus; size?: "lg" }) {
  return <Pill tone={APPROVAL_STATUS_TONE[value]} size={size}>{APPROVAL_STATUS_LABEL[value]}</Pill>;
}

/** Type icon or (for images) a lazily signed thumbnail. */
export function FileThumb({ name, mime, path, size = 40, className, rounded = "rounded-[var(--radius-sm)]" }: { name: string; mime?: string | null; path?: string | null; size?: number; className?: string; rounded?: string }) {
  const group: MimeGroup = mimeGroup(mime, name);
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (group !== "image" || !path) return;
    let alive = true;
    signedUrl(createClient(), "files", path).then((u) => alive && setSrc(u));
    return () => { alive = false; };
  }, [group, path]);
  if (group === "image" && src && !failed) {
    return (
      <span className={cn("inline-flex shrink-0 overflow-hidden sunken border", rounded, className)} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", rounded, groupTone(group), className)} style={{ width: size, height: size }}>
      <FileTypeIcon group={group} size={Math.round(size * 0.48)} />
    </span>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/wiki/markdown";

/**
 * Safe markdown renderer for AI output. In-app links (/tasks/{id}, /projects/{id}, …) navigate
 * client-side instead of doing a full reload; external links keep their default behaviour.
 */
export function AIMarkdown({ source, className, onNavigate }: { source: string; className?: string; onNavigate?: () => void }) {
  const router = useRouter();
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest?.("a");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("/") || a.target === "_blank") return;
    e.preventDefault();
    onNavigate?.();
    router.push(href);
  };
  return (
    <div onClick={onClick} className="min-w-0 break-words">
      <Markdown source={source} className={className} />
    </div>
  );
}

"use client";

import * as React from "react";
import { EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, Spinner } from "@/components/ui";
import { mimeGroup, signedUrl } from "./storage";

type Loaded = { path: string; url: string | null; text: string | null; failed: boolean };

export function FilePreview({ name, mime, path }: { name: string; mime?: string | null; path: string }) {
  const group = mimeGroup(mime, name);
  const previewable = group === "image" || group === "pdf" || group === "video" || group === "audio" || group === "text" || group === "code";
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const current = loaded && loaded.path === path ? loaded : null;
  const loading = previewable && !current;

  React.useEffect(() => {
    if (!previewable) return;
    let alive = true;
    signedUrl(createClient(), "files", path).then(async (u) => {
      if (!alive) return;
      if (!u) { setLoaded({ path, url: null, text: null, failed: true }); return; }
      let text: string | null = null;
      let failed = false;
      if (group === "text" || group === "code") {
        try {
          const res = await fetch(u);
          const body = await res.text();
          text = body.length > 200_000 ? body.slice(0, 200_000) + "\n\n… (truncated)" : body;
        } catch {
          failed = true;
        }
      }
      if (alive) setLoaded({ path, url: u, text, failed });
    });
    return () => { alive = false; };
  }, [path, group, previewable]);

  if (!previewable || current?.failed) {
    return <EmptyState icon={<EyeOff size={18} />} title="No preview" hint={current?.failed ? "The file could not be loaded for preview." : "Download the file to open it in its native application."} className="py-[var(--s5)]" />;
  }
  if (loading || !current?.url) return <div className="flex items-center justify-center py-[var(--s6)]"><Spinner /></div>;
  const url = current.url;

  switch (group) {
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <div className="sunken rounded-[var(--radius-sm)] p-2 flex items-center justify-center"><img src={url} alt={name} className="max-w-full max-h-[70dvh] rounded object-contain" /></div>;
    case "pdf":
      return <iframe src={url} title={name} className="w-full h-[70dvh] rounded-[var(--radius-sm)] border bg-white" />;
    case "video":
      return <video src={url} controls className="w-full max-h-[70dvh] rounded-[var(--radius-sm)] bg-black" />;
    case "audio":
      return <audio src={url} controls className="w-full" />;
    default:
      return <pre className="sunken rounded-[var(--radius-sm)] border p-3 overflow-auto max-h-[70dvh] text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">{current.text ?? ""}</pre>;
  }
}

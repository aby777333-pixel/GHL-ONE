"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";

const TTL = 3600; // seconds
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string | null>>();

/** Signed URL for a path in the private `chat` bucket, cached for the TTL. */
export function getSignedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now() + 30_000) return Promise.resolve(hit.url);
  const pending = inflight.get(path);
  if (pending) return pending;
  const p = createClient()
    .storage.from("chat")
    .createSignedUrl(path, TTL)
    .then(({ data }) => {
      inflight.delete(path);
      if (!data?.signedUrl) return null;
      cache.set(path, { url: data.signedUrl, exp: Date.now() + TTL * 1000 });
      return data.signedUrl;
    })
    .catch(() => {
      inflight.delete(path);
      return null;
    });
  inflight.set(path, p);
  return p;
}

export function useSignedUrl(path?: string | null) {
  const [url, setUrl] = React.useState<string | null>(() => (path ? cache.get(path)?.url || null : null));
  React.useEffect(() => {
    if (!path) return;
    let alive = true;
    getSignedUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

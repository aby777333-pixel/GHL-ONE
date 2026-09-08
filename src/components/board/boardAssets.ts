"use client";
/**
 * Images and files dropped on a board live in the private `live` bucket.
 * Supabase Storage validates the Blob's own `.type`, so every File is re-wrapped with an
 * explicit type before upload and `contentType` is passed as well (see components/files/storage.ts).
 */
import { createClient } from "@/lib/supabase/client";
import { boardAssetPath, RECORDING_BUCKET } from "@/lib/live/types";
import { guessMime } from "@/components/files/storage";

const TTL = 3600;
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string | null>>();

export const BOARD_MAX_BYTES = 25 * 1024 * 1024;

/** Signed URL for a path in the `live` bucket, cached until shortly before it expires. */
export function boardSignedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now() + 30_000) return Promise.resolve(hit.url);
  const pending = inflight.get(path);
  if (pending) return pending;
  const p = createClient()
    .storage.from(RECORDING_BUCKET)
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

export async function uploadBoardAsset(orgId: string, boardId: string, file: File): Promise<{ path: string; type: string } | { error: string }> {
  if (file.size > BOARD_MAX_BYTES) return { error: `${file.name} is larger than 25 MB` };
  const type = file.type || guessMime(file.name);
  const body = file.type === type ? file : new File([file], file.name, { type });
  const path = boardAssetPath(orgId, boardId, file.name);
  const { error } = await createClient().storage.from(RECORDING_BUCKET).upload(path, body, { contentType: type, cacheControl: "3600", upsert: false });
  if (error) return { error: error.message };
  return { path, type };
}

/** Load a storage path into an <img> the canvas can draw. Resolves to null when it cannot be read. */
export async function loadBoardImage(path: string): Promise<HTMLImageElement | null> {
  const url = await boardSignedUrl(path);
  if (!url) return null;
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

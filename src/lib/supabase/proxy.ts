// Browser traffic to Supabase goes through the app's own origin (`/sb/*`), because some Indian
// networks block `*.supabase.co` outright — the browser then reports a bare "Failed to fetch" on
// sign-in and password reset while the service itself is healthy. Netlify proxies `/sb/*` to the
// project at the CDN (netlify.toml); `next.config.ts` carries the same rewrite for `next dev`.
//
// The client keeps the real project URL, so the auth cookie name (`sb-<ref>-auth-token`), the
// server client and Realtime are all unchanged — only the HTTP requests are redirected. Realtime is
// a WebSocket, which a Netlify rewrite cannot carry, so on a blocked network live updates still need
// the direct connection.

export const SUPABASE_PROXY_PATH = "/sb";

const ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");

// Large uploads (recordings) go direct: a proxied request is subject to the CDN's time limit.
const DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Rewrite a Supabase URL onto the same-origin proxy. Anything else is returned untouched. */
export function viaProxy<T extends string | null | undefined>(url: T): T {
  if (!url || !ORIGIN || !url.startsWith(ORIGIN + "/")) return url;
  return (SUPABASE_PROXY_PATH + url.slice(ORIGIN.length)) as T;
}

function bodySize(body: BodyInit | null | undefined): number {
  if (!body) return 0;
  if (typeof body === "string") return body.length;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (body instanceof FormData) {
    let n = 0;
    body.forEach((v) => { n += typeof v === "string" ? v.length : v.size; });
    return n;
  }
  return Infinity; // a stream has no known size — do not risk the proxy's time limit
}

/** `fetch` for the browser Supabase client: same request, sent via `/sb` unless it is a large upload. */
export const proxiedFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const target = viaProxy(url);
  if (target === url) return fetch(input, init);

  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const isUpload = url.includes("/storage/v1/upload/") ||
    (url.includes("/storage/v1/object/") && (method === "POST" || method === "PUT"));
  if (isUpload && bodySize(init?.body) > DIRECT_UPLOAD_BYTES) return fetch(input, init);

  return input instanceof Request ? fetch(new Request(target, input), init) : fetch(target, init);
};

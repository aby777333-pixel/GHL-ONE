import type { NextConfig } from "next";

// Baseline response headers. No Content-Security-Policy yet: LiveKit, Supabase Realtime and the
// AI routes need an allowlist tested in the browser first, and a wrong CSP fails silently for users.
const securityHeaders = [
  // Nothing may frame the app — login, approvals and admin screens are clickjacking targets.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // GHL LIVE needs camera, microphone and screen share; clock-in asks for location with consent.
  // Same-origin only, so an embedded third party can never request them.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(self), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // Same-origin path to Supabase for networks that block *.supabase.co (see src/lib/supabase/proxy.ts).
  // On Netlify the CDN answers /sb/* first (netlify.toml); this rewrite covers `next dev`.
  async rewrites() {
    const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
    return supabase ? [{ source: "/sb/:path*", destination: `${supabase}/:path*` }] : [];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

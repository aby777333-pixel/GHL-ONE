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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

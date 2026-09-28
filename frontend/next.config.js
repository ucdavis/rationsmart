const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  // Disabled in dev AND when DISABLE_PWA=true (set on the testing
  // Vercel project). The testing branch iterates fast, and the SW
  // runtime cache keeps serving stale JS chunks for up to 24h, which
  // makes diagnostic logs invisible until users clear site data.
  // Skip the SW entirely on the testing deployment.
  disable: process.env.NODE_ENV === "development" || process.env.DISABLE_PWA === "true",
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      // SECURITY: never cache API traffic. /api/proxy/* responses are
      // per-user (profiles, simulations, admin user lists) and must not be
      // served to the next person on a shared device. Must stay FIRST —
      // Workbox uses the first matching rule.
      {
        urlPattern: /\/api\/proxy\//,
        handler: "NetworkOnly",
      },
      // Don't cache Next.js build chunks — they have content hashes and change every rebuild
      {
        urlPattern: /^https?.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "runtime-cache",
          expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
          networkTimeoutSeconds: 10,
        },
      },
    ],
  },
});

// SECURITY: strip console.* (except console.error) from every production
// bundle. Diagnostic logging is opt-in per build via NEXT_PUBLIC_DEBUG_API
// (see api.ts) or KEEP_CONSOLE — deliberately NOT tied to DISABLE_PWA, which
// the public testing deployment sets. Dev is never stripped.
const keepConsole =
  process.env.KEEP_CONSOLE === "true" || process.env.NEXT_PUBLIC_DEBUG_API === "true";

// Security response headers.
//
// Content-Security-Policy (audit A-04). The app loads nothing from other
// origins (Nunito is self-hosted via next/font), so everything is 'self':
// - connect-src 'self': XHR/fetch/WebSocket can only reach this origin, so a
//   script that did get injected couldn't send the JWT anywhere else;
// - img-src 'self' data: blob: — no third-party image beacons either.
// script-src still needs 'unsafe-inline': Next 14 App Router emits inline
// bootstrap scripts, and giving them nonces would force every page to render
// dynamically (no static pages, no SW precache). style-src needs it for the
// inline style attributes used throughout. Moving the JWT to an httpOnly
// cookie (needs the backend) is what fully removes the token-theft risk.
const contentSecurityPolicy = [
  "default-src 'self'",
  // `next dev` (React Refresh) needs eval; production never gets it.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

module.exports = withPWA({
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // ESLint is available via `npm run lint` for standards checking, but it is
  // NOT run during `next build`: the codebase predates linting and has
  // intentional patterns (see CLAUDE.md §10) a fresh ruleset would flag, so
  // gating deploys on a clean lint would break the manual deploy flow. Run
  // `npm run lint` manually and triage findings against CLAUDE.md.
  eslint: {
    ignoreDuringBuilds: true,
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" && !keepConsole
        ? { exclude: ["error"] }
        : false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
});

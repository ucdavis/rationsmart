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

// Security response headers. Kept intentionally conservative: no strict CSP
// because the app uses inline styles/Android-exact pixel values everywhere,
// which a default CSP would break. These four are universally safe and cover
// the common audit checks (MIME sniffing, clickjacking, referrer leakage,
// unused browser features).
const securityHeaders = [
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

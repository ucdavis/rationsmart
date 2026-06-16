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
    // Don't cache Next.js build chunks — they have content hashes and change every rebuild
    runtimeCaching: [
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

module.exports = withPWA({
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
});

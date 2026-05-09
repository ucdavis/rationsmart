const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
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

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Each test file gets a fresh module graph — and so a fresh Zustand store
    // and fresh module-level caches — so state can't leak between files
    // (audit B-38). This is vitest's default; stated so nobody turns it off
    // for speed without noticing.
    isolate: true,
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Floors set just under the measured baseline so coverage can only
      // ratchet up. Raise them as tests are added (audit B-38).
      // Re-based 2026-11-19 for vitest 4 (N15), whose v8 coverage maps back
      // to the source and counts branches differently: same tests, measured
      // statements 84.3 %, branches 76.8 %, functions 81.0 %, lines 87.0 %
      // (vitest 1: 83.4 / 79.7 / 71.7 / 83.4). Only branches went down, and
      // only because of the new way of counting.
      thresholds: {
        statements: 84,
        lines: 86,
        branches: 76,
        functions: 80,
      },
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/app/**/layout.tsx",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

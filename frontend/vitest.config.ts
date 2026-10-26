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
      // Re-measured 2026-10-26 after vitest 1 → 5: its v8 coverage maps
      // results to the source AST and counts more branches (?? / ?.), so the
      // same 909 tests now read statements 81.8 %, lines 84.8 %, branches
      // 73.9 %, functions 77.7 % (was 83.4 / 83.4 / 79.7 / 71.7 on vitest 1).
      thresholds: {
        statements: 81,
        lines: 84,
        branches: 73,
        functions: 77,
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

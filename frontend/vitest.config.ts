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
      // Floors set just under the measured baseline (2026-09-28: statements /
      // lines 83.4 %, branches 79.7 %, functions 71.7 %) so coverage can only
      // ratchet up. Raise them as tests are added (audit B-38).
      thresholds: {
        statements: 83,
        lines: 83,
        branches: 79,
        functions: 71,
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

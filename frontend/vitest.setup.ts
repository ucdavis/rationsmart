import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom 23 in vitest ships a `localStorage` stub that lacks setItem /
// getItem / removeItem / clear on its prototype (only "length" and the
// index accessor). Zustand's persist middleware calls storage.setItem
// directly, so it explodes. Install a proper Map-backed polyfill on the
// window / global BEFORE any test module (including the store) is
// imported — vitest runs setupFiles before the test files, so this
// takes effect on module load.
function installStorageShim(): Storage {
  const backing = new Map<string, string>();
  const shim: Storage = {
    get length() { return backing.size; },
    key(i) { return Array.from(backing.keys())[i] ?? null; },
    getItem(k) { return backing.has(k) ? (backing.get(k) as string) : null; },
    setItem(k, v) { backing.set(String(k), String(v)); },
    removeItem(k) { backing.delete(k); },
    clear() { backing.clear(); },
  };
  return shim;
}

if (typeof window !== "undefined") {
  const needsShim =
    !window.localStorage || typeof window.localStorage.setItem !== "function";
  if (needsShim) {
    Object.defineProperty(window, "localStorage", {
      value: installStorageShim(),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      value: installStorageShim(),
      configurable: true,
      writable: true,
    });
  }
}

// Reset RTL + localStorage between every test so persist / store state
// never bleeds across tests.
afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") {
    try { window.localStorage?.clear?.(); } catch {}
    try { window.sessionStorage?.clear?.(); } catch {}
  }
  vi.restoreAllMocks();
});

// jsdom does NOT implement matchMedia; some Next / library code touches it.
beforeEach(() => {
  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

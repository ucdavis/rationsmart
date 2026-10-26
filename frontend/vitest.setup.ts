import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, inject, vi } from "vitest";
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
    get length() {
      return backing.size;
    },
    key(i) {
      return Array.from(backing.keys())[i] ?? null;
    },
    getItem(k) {
      return backing.has(k) ? (backing.get(k) as string) : null;
    },
    setItem(k, v) {
      backing.set(String(k), String(v));
    },
    removeItem(k) {
      backing.delete(k);
    },
    clear() {
      backing.clear();
    },
  };
  return shim;
}

if (typeof window !== "undefined") {
  const needsShim = !window.localStorage || typeof window.localStorage.setItem !== "function";
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
    try {
      window.localStorage?.clear?.();
    } catch {}
    try {
      window.sessionStorage?.clear?.();
    } catch {}
  }
  vi.restoreAllMocks();
});

// jsdom does NOT implement scrollIntoView; app code calls it (e.g. the
// feed-selection search-result flow scrolls the filled card back into view).
// Stub it so those code paths don't throw "Not implemented" under test.
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

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

// Email-action cooldowns (audit A-20) are module-level; reset them so one
// test's successful send doesn't block the next test's.
import { resetEmailCooldowns } from "./src/lib/email-cooldown";
beforeEach(() => resetEmailCooldowns());

// UI labels come from the server route /api/ui-labels/<code> (built from
// src/lib/data/ui-labels.xlsx). jsdom has no server, so answer those requests
// from the same spreadsheet with the same parser; everything else goes to the
// real fetch. The sheet is parsed once per run in vitest.global-setup.ts.
import { dictionaryFor } from "./src/lib/ui-labels-sheet.mjs";
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const lang = /^\/api\/ui-labels\/([^/?#]+)$/.exec(url)?.[1];
  if (lang === undefined) return realFetch(input, init);
  const sheet = inject("uiLabelSheet");
  if (!sheet.languages.some((l) => l.code === lang)) return new Response(null, { status: 404 });
  return Response.json(dictionaryFor(sheet, lang));
};

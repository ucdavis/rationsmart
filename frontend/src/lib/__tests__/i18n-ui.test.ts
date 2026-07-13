import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { getUiLabel, useT } from "@/lib/i18n-ui";
import { useStore, type User } from "@/lib/store";

const seedUser = (over: Partial<User> = {}): User => ({
  id: "u-1",
  name: "Aiyappa",
  email: "aiyappa@dg.org",
  country: "India",
  country_id: "1",
  country_code: "IN",
  currency: "INR",
  pin: "123456",
  is_admin: false,
  token: "jwt",
  registered_language: "en",
  preferred_language: "en",
  ...over,
});

beforeEach(() => {
  useStore.setState({ user: null });
});

// Each language's dictionary is lazy-loaded via dynamic import() and
// cached at module scope — once a test in this file loads "hi" (say),
// it stays warm for every later test, same as a real session. Tests
// below are ordered so a language is loaded via useT()+waitFor before
// any getUiLabel assertion relies on it being cached.
describe("useT — lazy per-language loading", () => {
  it("defaults to English when there is no signed-in user (no dictionary import triggered)", () => {
    const { result } = renderHook(() => useT());
    expect(result.current("Continue")).toBe("Continue");
  });

  it("returns English immediately, then the real translation once the Hindi dictionary finishes loading", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    const { result } = renderHook(() => useT());
    await waitFor(() => expect(result.current("Continue")).toBe("जारी रखें"));
  });

  it("reflects a change to preferred_language, loading that language's dictionary too", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "en" }) });
    const { result, rerender } = renderHook(() => useT());
    expect(result.current("Continue")).toBe("Continue");

    act(() => {
      useStore.setState({ user: seedUser({ preferred_language: "vi" }) });
    });
    rerender();
    await waitFor(() => expect(result.current("Continue")).toBe("Tiếp tục"));
  });

  it("loads Filipino (tl) too, so its dictionary is warm for the getUiLabel tests below", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "tl" }) });
    const { result } = renderHook(() => useT());
    await waitFor(() => expect(result.current("Proceed")).toBe("Magpatuloy"));
  });
});

describe("getUiLabel — pure lookup against the in-memory cache", () => {
  it("returns the English source unchanged when lang is 'en'", () => {
    expect(getUiLabel("Continue", "en")).toBe("Continue");
  });

  it("returns the Hindi translation now that 'hi' is loaded (see useT block above)", () => {
    expect(getUiLabel("Continue", "hi")).toBe("जारी रखें");
  });

  it("translates a multi-line source string (embedded \\n) verbatim as one dictionary key", () => {
    const source = "Smart feeding.\nMaximum yield.\nMinimal cost.";
    const hi = getUiLabel(source, "hi");
    expect(hi).toContain("स्मार्ट चारा");
    expect(hi).not.toBe(source);
  });

  it("falls back to the English source when the key isn't in the dictionary at all", () => {
    expect(getUiLabel("Some string nobody ever added to the sheet", "hi")).toBe(
      "Some string nobody ever added to the sheet"
    );
  });

  it("falls back to the English source when the key exists but that language's cell was the same word (tl)", () => {
    // The sheet has "Email Address" -> tl: "Email Address" verbatim —
    // exercises a real dictionary hit, distinct from the not-loaded
    // fallback below (tl was warmed by the useT block above).
    expect(getUiLabel("Email Address", "tl")).toBe("Email Address");
  });

  it("returns an empty string unchanged (no crash on falsy input)", () => {
    expect(getUiLabel("", "hi")).toBe("");
  });

  it("falls back to English for a language code that isn't in the rollout set", () => {
    expect(getUiLabel("Continue", "fr")).toBe("Continue");
  });

  it("falls back to English for a known rollout code whose dictionary hasn't been loaded in this session yet", () => {
    // "om" (Oromo) was never triggered via useT() in this file.
    expect(getUiLabel("Continue", "om")).toBe("Continue");
  });
});

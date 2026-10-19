import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { render, renderHook, waitFor, act } from "@testing-library/react";
import { fillTemplate, fillText, getUiLabel, useT } from "@/lib/i18n-ui";
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
  useStore.setState({ user: null, lastUiLanguage: "en" });
});

// Each language's dictionary is fetched from /api/ui-labels/<code> (answered
// from the spreadsheet by vitest.setup.ts) and
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
    expect(hi).toContain("संतुलित आहार प्रणाली");
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

  it("stays in English, and asks only once, for a language the sheet has no column for", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    useStore.setState({ user: seedUser({ preferred_language: "sw" }) });
    const { result, rerender } = renderHook(() => useT());
    await waitFor(() => expect(spy).toHaveBeenCalledWith("/api/ui-labels/sw", expect.anything()));
    const res = await spy.mock.results[0]?.value;
    expect(res.status).toBe(404);
    rerender();
    expect(result.current("Continue")).toBe("Continue");
    renderHook(() => useT());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("never requests a malformed language code", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderHook(() => useT("../hi"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls back to English for a known rollout code whose dictionary hasn't been loaded in this session yet", () => {
    // "om" (Oromo) was never triggered via useT() in this file.
    expect(getUiLabel("Continue", "om")).toBe("Continue");
  });
});

// langOverride — used by cattle-info/feed-selection/report, which
// resolve language from cattleInfo.simulation_language rather than
// user.preferred_language (see the doc comment on useT for why).
describe("useT — langOverride parameter", () => {
  it("ignores user.preferred_language entirely when an override is passed", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    const { result } = renderHook(() => useT("vi"));
    await waitFor(() => expect(result.current("Continue")).toBe("Tiếp tục"));
  });

  it("falls back to the user's preferred_language when no override is passed (unchanged default behavior)", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    const { result } = renderHook(() => useT());
    await waitFor(() => expect(result.current("Continue")).toBe("जारी रखें"));
  });

  it("reacts live to a changing override without needing the store to change", async () => {
    let lang = "en";
    const { result, rerender } = renderHook(() => useT(lang));
    expect(result.current("Continue")).toBe("Continue");

    lang = "hi";
    rerender();
    await waitFor(() => expect(result.current("Continue")).toBe("जारी रखें"));
  });
});

// Bug fixed 2026-07-13 — a signed-in user whose preferred_language is
// falsy must resolve to English, never leak the device's stale
// lastUiLanguage from a previous session/account. lastUiLanguage should
// ONLY apply when there is no signed-in user at all (post-logout).
describe("useT — lastUiLanguage must not leak while a user is signed in", () => {
  it("resolves to English for a signed-in user with an empty preferred_language, even when lastUiLanguage is Hindi from an earlier session", () => {
    useStore.setState({
      user: seedUser({ preferred_language: "" }),
      lastUiLanguage: "hi",
    });
    const { result } = renderHook(() => useT());
    expect(result.current("Continue")).toBe("Continue");
  });

  it("still uses lastUiLanguage when there is genuinely no signed-in user (post-logout)", async () => {
    useStore.setState({ user: null, lastUiLanguage: "hi" });
    const { result } = renderHook(() => useT());
    await waitFor(() => expect(result.current("Continue")).toBe("जारी रखें"));
  });

  it("prefers the signed-in user's own preferred_language over lastUiLanguage even when they differ", async () => {
    useStore.setState({
      user: seedUser({ preferred_language: "vi" }),
      lastUiLanguage: "hi",
    });
    const { result } = renderHook(() => useT());
    await waitFor(() => expect(result.current("Continue")).toBe("Tiếp tục"));
  });
});

describe("fillText / fillTemplate — whole-sentence templates", () => {
  it("fills every slot, in whatever order the translation puts them", () => {
    // Hindi puts the total before the number ("5 में से 2").
    expect(fillText("${total} में से ${n}", { n: 2, total: 5 })).toBe("5 में से 2");
    expect(fillText("Page ${N} of ${M}", { N: 1, M: 3 })).toBe("Page 1 of 3");
  });

  it("leaves an unknown slot untouched rather than blanking it", () => {
    expect(fillText("Saved ${feed}", {})).toBe("Saved ${feed}");
  });

  it("fillTemplate places a React node (a bold name) inside the sentence", () => {
    const { container } = render(
      createElement(
        "p",
        null,
        fillTemplate("${name} will lose admin access.", { name: createElement("b", null, "Asha") })
      )
    );
    expect(container.querySelector("b")?.textContent).toBe("Asha");
    expect(container.textContent).toBe("Asha will lose admin access.");
  });
});

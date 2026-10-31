import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import SplashOverlay from "@/components/SplashOverlay";
import { useStore, type User } from "@/lib/store";

const { pathnameRef } = vi.hoisted(() => ({ pathnameRef: { current: "/" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

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
  preferred_language: "en",
  ...over,
});

beforeEach(() => {
  pathnameRef.current = "/";
  useStore.setState({ user: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SplashOverlay", () => {
  it('on "/" — renders the branded splash immediately', () => {
    vi.useFakeTimers();
    pathnameRef.current = "/";
    const { container } = render(<SplashOverlay />);
    expect(container.querySelector("#pwa-splash")).toBeTruthy();
    expect(container.textContent).toContain("RationSmart");
  });

  it('on "/" — stays visible right before the 2s mark', () => {
    vi.useFakeTimers();
    pathnameRef.current = "/";
    const { container } = render(<SplashOverlay />);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(container.querySelector("#pwa-splash")).toBeTruthy();
  });

  it('on "/" — unmounts itself after the full 2s splash duration', () => {
    vi.useFakeTimers();
    pathnameRef.current = "/";
    const { container } = render(<SplashOverlay />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector("#pwa-splash")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("on any other path — unmounts immediately, no 2s wait", () => {
    pathnameRef.current = "/cattle-info";
    const { container } = render(<SplashOverlay />);
    expect(container.querySelector("#pwa-splash")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("clears the pending timer on unmount (no act warning / stray setVisible after unmount)", () => {
    vi.useFakeTimers();
    pathnameRef.current = "/";
    const { unmount } = render(<SplashOverlay />);
    unmount();
    // Advancing timers post-unmount must not throw or warn.
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(2000);
      });
    }).not.toThrow();
  });

  // UI-label translation (src/lib/i18n-ui.ts) — the brand names "RationSmart"
  // and "DigitalGreen" are pass-through rows in every locale; "POWERED BY" is
  // translated (reviewed sheet, 2026-10-16).
  it("keeps the brand names and translates POWERED BY with preferred_language 'hi'", async () => {
    pathnameRef.current = "/";
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    const { container } = render(<SplashOverlay />);
    await waitFor(() => expect(container.textContent).toContain("द्वारा संचालित"));
    expect(container.textContent).toContain("RationSmart");
    expect(container.textContent).toContain("DigitalGreen");
  });
});

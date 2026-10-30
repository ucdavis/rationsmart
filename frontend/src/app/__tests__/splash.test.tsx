import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back: vi.fn(), push: vi.fn() }),
}));

import SplashScreen from "@/app/page";
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
  registered_language: "hi",
  preferred_language: "hi",
  ...over,
});

beforeEach(() => {
  replace.mockClear();
  useStore.setState({ user: null });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Splash screen", () => {
  it("waits the full 2s before navigating — no early redirect", () => {
    render(<SplashScreen />);
    vi.advanceTimersByTime(1999);
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /cattle-info after 2s when a user is present", () => {
    useStore.setState({ user: seedUser() });
    render(<SplashScreen />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(replace).toHaveBeenCalledWith("/cattle-info");
  });

  it("redirects to /welcome after 2s when there is no user", () => {
    useStore.setState({ user: null });
    render(<SplashScreen />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(replace).toHaveBeenCalledWith("/welcome");
  });
});

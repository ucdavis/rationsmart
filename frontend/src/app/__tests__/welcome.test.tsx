import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

import WelcomePage from "@/app/welcome/page";
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
  push.mockClear();
  useStore.setState({ user: null, lastUiLanguage: "en" });
});

describe("Welcome page", () => {
  it("renders the illustration and tagline", () => {
    render(<WelcomePage />);
    expect(screen.getByAltText("Welcome illustration")).toBeInTheDocument();
    expect(screen.getByText(/Smart feeding\./)).toBeInTheDocument();
    expect(screen.getByText(/Maximum yield\./)).toBeInTheDocument();
    expect(screen.getByText(/Minimal cost\./)).toBeInTheDocument();
  });

  it("Continue button navigates to /login", () => {
    render(<WelcomePage />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(push).toHaveBeenCalledWith("/login");
  });

  // UI-label translation (src/lib/i18n-ui.ts) — proves the tagline + CTA
  // wire through useT() the same way help/page.tsx does.
  it("translates the tagline and Continue button when user.preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<WelcomePage />);
    // The multi-line tagline is one dictionary key with an embedded \n —
    // dictionary lazy-loads via dynamic import(), so wait for it.
    await screen.findByText(/स्मार्ट चारा/);
    expect(screen.getByRole("button", { name: /जारी रखें/ })).toBeInTheDocument();
  });
});

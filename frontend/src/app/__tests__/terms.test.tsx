import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { back } = vi.hoisted(() => ({ back: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn(), push: vi.fn() }),
}));

import TermsPage from "@/app/terms/page";
import { useStore, type User } from "@/lib/store";

const SECTION_TITLES = [
  "1. Acceptance of Terms",
  "2. Use of Service",
  "3. Data Privacy",
  "4. Accuracy of Information",
  "5. Account Responsibility",
  "6. Intellectual Property",
  "7. Limitation of Liability",
  "8. Changes to Terms",
  "9. Contact",
];

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
  back.mockClear();
  useStore.setState({ user: null });
});

describe("Terms & Conditions page", () => {
  it("renders the last-updated header", () => {
    render(<TermsPage />);
    expect(
      screen.getByText("Last updated: January 2025 · Digital Green Foundation")
    ).toBeInTheDocument();
  });

  it("renders all 9 section headings", () => {
    render(<TermsPage />);
    for (const title of SECTION_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("translates the toolbar title + header + a section heading when user.preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<TermsPage />);
    // "Terms & Conditions" appears twice (toolbar + header card) — the
    // "hi" dictionary lazy-loads via dynamic import(), so findAll waits
    // for it to resolve rather than assuming it's already cached.
    const matches = await screen.findAllByText("नियम और शर्तें");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("1. नियमों की स्वीकृति")).toBeInTheDocument();
    expect(screen.queryByText("Terms & Conditions")).not.toBeInTheDocument();
  });
});

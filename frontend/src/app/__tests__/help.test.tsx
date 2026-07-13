import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { back } = vi.hoisted(() => ({ back: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn(), push: vi.fn() }),
}));

import HelpAndSupportPage from "@/app/help/page";
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
  back.mockClear();
  useStore.setState({ user: null });
});

describe("Help & Support page", () => {
  it("renders all 3 rows", () => {
    render(<HelpAndSupportPage />);
    expect(screen.getByText("User Manual")).toBeInTheDocument();
    expect(screen.getByText("FAQs")).toBeInTheDocument();
    expect(screen.getByText("Contact Us")).toBeInTheDocument();
  });

  // UI-label translation (src/lib/i18n-ui.ts) — this is the first screen
  // wired up end-to-end as the proof-of-concept for the infrastructure.
  it("renders in English with no signed-in user (pre-login fallback, same chain as feed-data i18n)", () => {
    render(<HelpAndSupportPage />);
    expect(screen.getByText("Help & Support")).toBeInTheDocument();
    expect(screen.getByText("User Manual")).toBeInTheDocument();
  });

  it("translates every row + the toolbar title when user.preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<HelpAndSupportPage />);
    // The "hi" dictionary lazy-loads via dynamic import() — findBy waits
    // for it to resolve rather than assuming it's already in the cache.
    await screen.findByText("सहायता एवं समर्थन"); // Help & Support
    expect(screen.getByText("उपयोगकर्ता मैनुअल")).toBeInTheDocument(); // User Manual
    expect(screen.getByText("सामान्य प्रश्न")).toBeInTheDocument(); // FAQs
    expect(screen.getByText("संपर्क करें")).toBeInTheDocument(); // Contact Us
    expect(screen.queryByText("Help & Support")).not.toBeInTheDocument();
  });

  it("Contact Us still opens the same mailto link regardless of display language", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<HelpAndSupportPage />);
    const row = (await screen.findByText("संपर्क करें")).closest("button") as HTMLButtonElement;

    const originalLocation = window.location;
    // @ts-expect-error — intentionally replacing with a minimal stub
    delete window.location;
    // @ts-expect-error — minimal stub, only `href` is used by the page
    window.location = { href: "" };

    fireEvent.click(row);
    expect(window.location.href).toBe("mailto:admin@digitalgreen.org");

    window.location = originalLocation;
  });

  it("User Manual has no handler yet (TODO) — clicking does nothing and does not throw", () => {
    render(<HelpAndSupportPage />);
    const row = screen.getByText("User Manual").closest("button") as HTMLButtonElement;
    // Native buttons aren't `disabled` here (Android parity keeps them
    // tappable-looking); the TODO-ness shows up as onClick={undefined}
    // and cursor:"default" rather than a disabled attribute.
    expect(() => fireEvent.click(row)).not.toThrow();
    expect(row).toHaveStyle({ cursor: "default" });
  });

  it("FAQs has no handler yet (TODO) — clicking does nothing and does not throw", () => {
    render(<HelpAndSupportPage />);
    const row = screen.getByText("FAQs").closest("button") as HTMLButtonElement;
    expect(() => fireEvent.click(row)).not.toThrow();
    expect(row).toHaveStyle({ cursor: "default" });
  });

  it("Contact Us row is interactive (cursor: pointer) and opens the support mailto link", () => {
    render(<HelpAndSupportPage />);
    const row = screen.getByText("Contact Us").closest("button") as HTMLButtonElement;
    expect(row).toHaveStyle({ cursor: "pointer" });

    // jsdom logs a noisy "Not implemented: navigation" error whenever
    // location.href is actually assigned. Stub out `location` with a
    // plain writable object so we can assert the attempted mailto URL
    // without touching jsdom's real navigation machinery.
    const originalLocation = window.location;
    // @ts-expect-error — intentionally replacing with a minimal stub
    delete window.location;
    // @ts-expect-error — minimal stub, only `href` is used by the page
    window.location = { href: "" };

    fireEvent.click(row);
    expect(window.location.href).toBe("mailto:admin@digitalgreen.org");

    window.location = originalLocation;
  });
});

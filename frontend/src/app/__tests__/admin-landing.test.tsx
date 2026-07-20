import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { replace, back, push } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push }),
}));

import AdminPage from "@/app/(main)/admin/page";
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
  is_admin: true,
  token: "jwt",
  registered_language: "en",
  preferred_language: "en",
  ...over,
});

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  push.mockClear();
  useStore.setState({
    user: null,
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  } as never);
});

describe("Admin landing — admin user", () => {
  beforeEach(() => {
    useStore.setState({ user: seedUser() } as never);
  });

  it("renders the 5 documented nav cards and navigates to the right routes", () => {
    render(<AdminPage />);

    const expected: [string, string][] = [
      ["User Management", "/admin/users"],
      ["Feed Management", "/admin/feeds"],
      ["Feedback Management", "/admin/feedback"],
      ["Bulk Upload & Export Feed", "/admin/bulk-upload"],
      ["Feed Reports", "/admin/reports"],
      ["Country/ Language", "/admin/country-language"],
      ["Feed Library Sync", "/admin/feed-sync"],
    ];

    // Card titles render with a literal "\n" (whiteSpace: pre-line for the
    // 2-line Android string resources) which the accessible-name computation
    // does NOT collapse to a single space, so match with a normalizing fn.
    for (const [name, href] of expected) {
      const btn = screen.getByRole("button", {
        name: (accName) => accName.replace(/\s+/g, " ").trim() === name,
      });
      fireEvent.click(btn);
      expect(push).toHaveBeenCalledWith(href);
      push.mockClear();
    }
  });

  it("does not redirect an admin user away", () => {
    render(<AdminPage />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("WELCOME")).toBeInTheDocument();
    expect(screen.getByText("Aiyappa")).toBeInTheDocument();
  });

  // UI-label translation (src/lib/i18n-ui.ts) — the "hi" dictionary
  // lazy-loads via dynamic import(), so findBy waits for it to resolve.
  it("translates the toolbar title, WELCOME label, and a nav card title when preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) } as never);
    render(<AdminPage />);
    await screen.findByText("स्वागत है"); // WELCOME
    expect(screen.getByText("व्यवस्थापक")).toBeInTheDocument(); // Admin (toolbar title)
    // getByText's default normalizer collapses the embedded "\n" to a space.
    expect(screen.getByText("उपयोगकर्ता प्रबंधन")).toBeInTheDocument(); // User\nManagement
    expect(screen.queryByText("WELCOME")).not.toBeInTheDocument();
  });
});

describe("Admin landing — non-admin user", () => {
  it("redirects to /cattle-info", () => {
    useStore.setState({ user: seedUser({ is_admin: false }) } as never);
    render(<AdminPage />);
    expect(replace).toHaveBeenCalledWith("/cattle-info");
  });

  it("renders the Access Denied card instead of the grid", () => {
    useStore.setState({ user: seedUser({ is_admin: false }) } as never);
    render(<AdminPage />);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(
      screen.getByText("You do not have admin permissions to view this page.")
    ).toBeInTheDocument();
    expect(screen.queryByText("WELCOME")).not.toBeInTheDocument();
  });
});

describe("Admin landing — user not yet resolved (pre-hydration / loading)", () => {
  it("renders the Access Denied card (no distinct spinner state) and does not redirect", () => {
    // user is null here (see outer beforeEach) — component has no separate
    // "loading" flag; !user?.is_admin is true for both null-user and
    // non-admin-user, so both render the same Access Denied UI.
    render(<AdminPage />);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    // No redirect fires because `user && !user.is_admin` requires a truthy user.
    expect(replace).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { back, push, checkHelpGuide } = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  checkHelpGuide: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn(), push }),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkHelpGuide,
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
  push.mockClear();
  checkHelpGuide.mockReset();
  useStore.setState({ user: null });
});

/** A stand-in for the tab window.open returns. */
const fakeTab = () => ({ opener: {} as unknown, location: { href: "" }, close: vi.fn() });

describe("Help & Support page", () => {
  it("renders all 5 rows, the two printable guides after FAQs (N16)", () => {
    render(<HelpAndSupportPage />);
    const rows = screen.getAllByRole("button").map((b) => b.textContent);
    expect(rows.filter((r) => r !== "")).toEqual([
      "User Manual",
      "FAQs",
      "Printable User Guide (PDF)",
      "Quick Start card (PDF)",
      "Contact Us",
    ]);
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
    expect(screen.getByText("उपयोगकर्ता मार्गदर्शिका")).toBeInTheDocument(); // User Manual
    expect(screen.getByText("सामान्यतःपुछे जाने वाले प्रश्न")).toBeInTheDocument(); // FAQs
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

    window.location = originalLocation as string & Location;
  });

  it("User Manual and FAQs open the in-app help screens (N11)", () => {
    render(<HelpAndSupportPage />);
    const manual = screen.getByText("User Manual").closest("button") as HTMLButtonElement;
    const faqs = screen.getByText("FAQs").closest("button") as HTMLButtonElement;
    expect(manual).toHaveStyle({ cursor: "pointer" });
    expect(manual).not.toBeDisabled();
    fireEvent.click(manual);
    expect(push).toHaveBeenCalledWith("/help/manual");
    fireEvent.click(faqs);
    expect(push).toHaveBeenCalledWith("/help/faqs");
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

    window.location = originalLocation as string & Location;
  });

  describe("printable guide (N16)", () => {
    it("opens the User Guide in a new tab once it loads, in the profile language", async () => {
      useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
      checkHelpGuide.mockResolvedValue(undefined);
      const tab = fakeTab();
      const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
      render(<HelpAndSupportPage />);
      fireEvent.click(
        (await screen.findByText("छापने योग्य उपयोगकर्ता गाइड (PDF)")).closest("button")!
      );
      // The tab is opened on the tap (pop-up blockers), with no link back to the app.
      expect(open).toHaveBeenCalledWith("", "_blank");
      expect(tab.opener).toBeNull();
      expect(checkHelpGuide).toHaveBeenCalledWith("full", "hi");
      await waitFor(() =>
        expect(tab.location.href).toBe("/api/proxy/v1/help/guide?edition=full&lang=hi")
      );
      open.mockRestore();
    });

    it("opens the Quick Start card when logged out (English)", async () => {
      checkHelpGuide.mockResolvedValue(undefined);
      const tab = fakeTab();
      const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
      render(<HelpAndSupportPage />);
      fireEvent.click(screen.getByText("Quick Start card (PDF)").closest("button")!);
      await waitFor(() =>
        expect(tab.location.href).toBe("/api/proxy/v1/help/guide?edition=quick&lang=en")
      );
      expect(checkHelpGuide).toHaveBeenCalledWith("quick", "en");
      open.mockRestore();
    });

    it("a 503 closes the tab and shows the Help home message, not raw JSON", async () => {
      checkHelpGuide.mockRejectedValue(Object.assign(new Error("x"), { status: 503 }));
      const tab = fakeTab();
      const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
      render(<HelpAndSupportPage />);
      fireEvent.click(screen.getByText("Printable User Guide (PDF)").closest("button")!);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Help is not available right now."
      );
      expect(tab.close).toHaveBeenCalled();
      expect(tab.location.href).toBe("");
      open.mockRestore();
    });

    it("no internet shows 'Help needs internet.'", async () => {
      checkHelpGuide.mockRejectedValue(new Error("Network Error"));
      const open = vi.spyOn(window, "open").mockReturnValue(fakeTab() as unknown as Window);
      render(<HelpAndSupportPage />);
      fireEvent.click(screen.getByText("Quick Start card (PDF)").closest("button")!);
      expect(await screen.findByRole("alert")).toHaveTextContent("Help needs internet.");
      open.mockRestore();
    });

    it("a blocked pop-up opens the PDF in this tab instead", async () => {
      checkHelpGuide.mockResolvedValue(undefined);
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      const assign = vi.fn();
      const originalLocation = window.location;
      // @ts-expect-error — intentionally replacing with a minimal stub
      delete window.location;
      // @ts-expect-error — minimal stub, only `assign` is used here
      window.location = { assign };
      render(<HelpAndSupportPage />);
      fireEvent.click(screen.getByText("Printable User Guide (PDF)").closest("button")!);
      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith("/api/proxy/v1/help/guide?edition=full&lang=en")
      );
      window.location = originalLocation as string & Location;
      open.mockRestore();
    });
  });
});

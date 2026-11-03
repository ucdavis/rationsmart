import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import InstallPrompt from "@/components/InstallPrompt";
import { useStore, type User } from "@/lib/store";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cattle-info",
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

const STORAGE_KEY = "rationsmart-storage";

// Overrides the shared matchMedia stub from vitest.setup.ts (which always
// reports matches:false) so we can flip standalone-mode on/off per test.
function setStandalone(isStandalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isStandalone,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function dispatchBeforeInstallPrompt(
  overrides: Partial<{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }> = {}
) {
  const evt = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  evt.prompt = overrides.prompt ?? vi.fn().mockResolvedValue(undefined);
  evt.userChoice = overrides.userChoice ?? Promise.resolve({ outcome: "accepted" });
  // Dispatching outside of act() leaves the resulting setInstallEvent(...)
  // update unflushed by the time a synchronous fireEvent.click follows,
  // so the component still sees installEvent === null. Wrap it.
  act(() => {
    window.dispatchEvent(evt);
  });
  return evt;
}

beforeEach(() => {
  window.localStorage.clear();
  setStandalone(false);
  useStore.setState({ user: null });
});

afterEach(() => {
  delete (window as Window & { __rsInstallEvent?: Event }).__rsInstallEvent;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("InstallPrompt", () => {
  it("does not render the banner when already in standalone display-mode", async () => {
    setStandalone(true);
    vi.useFakeTimers();
    render(<InstallPrompt />);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Install RationSmart")).toBeNull();
  });

  it("renders the 'Install RationSmart' banner after the splash delay when not standalone", async () => {
    render(<InstallPrompt />);
    dispatchBeforeInstallPrompt();

    expect(screen.queryByText("Install RationSmart")).toBeNull();

    await waitFor(() => expect(screen.getByText("Install RationSmart")).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
  });

  it("captures beforeinstallprompt and calls .prompt() on the captured event when Install is clicked", async () => {
    render(<InstallPrompt />);
    const evt = dispatchBeforeInstallPrompt({
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument(),
      { timeout: 3000 }
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
      // Flush the microtask chain inside handleInstall (await prompt(), await userChoice).
      await evt.userChoice;
      await Promise.resolve();
    });

    expect(evt.prompt).toHaveBeenCalledOnce();
  });

  it("preventDefault is called on the captured beforeinstallprompt event (defers the native mini-infobar)", async () => {
    render(<InstallPrompt />);

    const evt = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    evt.prompt = vi.fn().mockResolvedValue(undefined);
    evt.userChoice = Promise.resolve({ outcome: "accepted" });
    const preventDefaultSpy = vi.spyOn(evt, "preventDefault");

    act(() => {
      window.dispatchEvent(evt);
    });

    expect(preventDefaultSpy).toHaveBeenCalledOnce();
  });

  it("clears localStorage['rationsmart-storage'] on accepted install outcome (landmine 10.12)", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { user: { id: "stale" } } }));
    render(<InstallPrompt />);
    const evt = dispatchBeforeInstallPrompt({
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument(),
      { timeout: 3000 }
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
      await evt.userChoice;
      await Promise.resolve();
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does NOT clear localStorage when the install prompt is dismissed", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { user: { id: "kept" } } }));
    render(<InstallPrompt />);
    const evt = dispatchBeforeInstallPrompt({
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    });
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument(),
      { timeout: 3000 }
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
      await evt.userChoice;
      await Promise.resolve();
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("clears localStorage['rationsmart-storage'] when the browser fires 'appinstalled' — critical anti-stale-auth landmine", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { user: { id: "stale-reinstall" } } })
    );
    render(<InstallPrompt />);

    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("dismiss (X) button hides the banner without touching localStorage", async () => {
    window.localStorage.setItem(STORAGE_KEY, "keep-me");
    render(<InstallPrompt />);
    dispatchBeforeInstallPrompt();
    await waitFor(() => expect(screen.getByText("Install RationSmart")).toBeInTheDocument(), {
      timeout: 3000,
    });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Install RationSmart")).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("keep-me");
  });

  it("does not render the banner in a browser tab once this browser has installed the app", async () => {
    window.localStorage.setItem("rationsmart-installed", "1");
    vi.useFakeTimers();
    render(<InstallPrompt />);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Install RationSmart")).toBeNull();
  });

  it("hides the banner and remembers the install when 'appinstalled' fires", async () => {
    render(<InstallPrompt />);
    dispatchBeforeInstallPrompt();
    await waitFor(() => expect(screen.getByText("Install RationSmart")).toBeInTheDocument(), {
      timeout: 3000,
    });

    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(screen.queryByText("Install RationSmart")).toBeNull();
    expect(window.localStorage.getItem("rationsmart-installed")).toBe("1");
  });

  it("shows the banner again if beforeinstallprompt fires after an uninstall (clears the stale flag)", async () => {
    window.localStorage.setItem("rationsmart-installed", "1");
    render(<InstallPrompt />);
    dispatchBeforeInstallPrompt();

    await waitFor(() => expect(screen.getByText("Install RationSmart")).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(window.localStorage.getItem("rationsmart-installed")).toBeNull();
  });

  it("does not render the banner off iOS when beforeinstallprompt never fires (already installed)", async () => {
    vi.useFakeTimers();
    render(<InstallPrompt />);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Install RationSmart")).toBeNull();
  });

  it("renders the banner on iOS without beforeinstallprompt (manual Share → Add flow)", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone)");
    render(<InstallPrompt />);

    await waitFor(() => expect(screen.getByText("Install RationSmart")).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it("picks up a beforeinstallprompt captured before hydration (window.__rsInstallEvent)", async () => {
    const early = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    early.prompt = vi.fn().mockResolvedValue(undefined);
    early.userChoice = Promise.resolve({ outcome: "accepted" });
    (window as Window & { __rsInstallEvent?: Event }).__rsInstallEvent = early;
    window.localStorage.setItem("rationsmart-installed", "1");

    render(<InstallPrompt />);
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument(),
      { timeout: 3000 }
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
      await early.userChoice;
      await Promise.resolve();
    });
    expect(early.prompt).toHaveBeenCalledOnce();
  });

  // UI-label translation (src/lib/i18n-ui.ts) — banner text + Install
  // button translate when preferred_language is 'hi'.
  it("translates the banner title, subtitle, and Install button when preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<InstallPrompt />);
    dispatchBeforeInstallPrompt();

    await waitFor(() => expect(screen.getByText("RationSmart इंस्टॉल करें")).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.getByText("ऐप अनुभव के लिए होम स्क्रीन में जोड़ें")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "इंस्टॉल करें" })).toBeInTheDocument();
    expect(screen.queryByText("Install RationSmart")).not.toBeInTheDocument();
  });

  it("translates the Got it steps sheet when preferred_language is 'hi'", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone)");
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<InstallPrompt />);
    await waitFor(
      () => expect(screen.getByRole("button", { name: "इंस्टॉल करें" })).toBeInTheDocument(),
      { timeout: 3000 }
    );

    fireEvent.click(screen.getByRole("button", { name: "इंस्टॉल करें" }));

    await waitFor(() => expect(screen.getByText("समझ गया")).toBeInTheDocument()); // Got it
  });
});

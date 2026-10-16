import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { replace, back, login, getUserProfile, getCountries, resetPin } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  login: vi.fn(),
  getUserProfile: vi.fn(),
  getCountries: vi.fn(),
  resetPin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, login, getUserProfile, getCountries, resetPin };
});

import LoginPage from "@/app/login/page";
import { useStore } from "@/lib/store";

beforeEach(() => {
  replace.mockClear();
  login.mockReset();
  getUserProfile.mockReset();
  getCountries.mockReset();
  resetPin.mockReset();
  useStore.setState({ user: null, lastUiLanguage: "en" } as never);
});

async function fillForm(email = "aiyappa@dg.org", pin = "123456") {
  const user = userEvent.setup();
  await user.type(screen.getAllByRole("textbox")[0], email);
  const pinInputs = document.querySelectorAll<HTMLInputElement>("input[type='password']");
  for (let i = 0; i < 6; i++) fireEvent.change(pinInputs[i], { target: { value: pin[i] } });
}

describe("Login — layout", () => {
  it("renders the standard fields + Proceed button", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /Proceed/ })).toBeInTheDocument();
    // Email textbox present
    expect(screen.getAllByRole("textbox").length).toBeGreaterThanOrEqual(1);
  });

  it("Proceed is disabled when form is empty", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /Proceed/ })).toBeDisabled();
  });
});

describe("Login — UI-label translation (src/lib/i18n-ui.ts)", () => {
  // Edge case noted in the i18n-ui rollout: a user can land back on /login
  // (e.g. after being logged out mid-flow) while the store still has a
  // stale user with preferred_language set — useT() reads it the same way
  // regardless of auth state. Dictionary lazy-loads via dynamic import(),
  // so the assertions wait for it.
  it("translates Email Address / Enter PIN / Proceed when preferred_language is 'hi'", async () => {
    useStore.setState({
      user: {
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
        preferred_language: "hi",
      } as never,
    });
    render(<LoginPage />);
    await screen.findByText("ईमेल पता/ ई-मेल आईडी");
    expect(screen.getByText("PIN कोड दर्ज करें")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "आगे बढ़ें" })).toBeInTheDocument();
  });

  // The actual bug report this covers: logging out used to reset the
  // whole auth flow back to English, because useT() had nothing to read
  // once `user` went null. lastUiLanguage (store.ts) is set alongside
  // every setUser() call and deliberately survives logout() — Login
  // (and every other pre-login screen) should render in whatever
  // language was last used on this device, with NO user signed in.
  it("renders in Hindi post-logout — no user, only lastUiLanguage set", async () => {
    useStore.setState({ user: null, lastUiLanguage: "hi" } as never);
    render(<LoginPage />);
    await screen.findByText("ईमेल पता/ ई-मेल आईडी");
    expect(screen.getByText("PIN कोड दर्ज करें")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "आगे बढ़ें" })).toBeInTheDocument();
  });
});

describe("Login — successful path", () => {
  it("prefers preferred_language from getUserProfile (the persisted choice)", async () => {
    login.mockResolvedValueOnce({
      data: {
        user: { id: "u-1", name: "Aiyappa", email_id: "aiyappa@dg.org", country_id: "1" },
        token: { access_token: "jwt-abc" },
        requires_pin_reset: false,
      },
    });
    // vi was the user's LAST choice from Profile → should come back on next login
    getUserProfile.mockResolvedValueOnce({
      data: { is_admin: false, registered_language: "hi", preferred_language: "vi" },
    });
    getCountries.mockResolvedValueOnce({ data: [{ id: "1", currency: "INR" }] });

    render(<LoginPage />);
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cattle-info"));

    const u = useStore.getState().user!;
    expect(u.preferred_language).toBe("vi");
    expect(u.token).toBe("jwt-abc");
  });

  it("falls back to registered_language when preferred_language is missing", async () => {
    login.mockResolvedValueOnce({
      data: {
        user: { id: "u-2", email_id: "x@x.com", country_id: "1" },
        token: { access_token: "t" },
      },
    });
    getUserProfile.mockResolvedValueOnce({
      data: { is_admin: false, registered_language: "hi" },
    });
    getCountries.mockResolvedValueOnce({ data: [] });

    render(<LoginPage />);
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(useStore.getState().user?.preferred_language).toBe("hi");
  });

  it("defaults to 'en' when neither field is on the response", async () => {
    login.mockResolvedValueOnce({
      data: { user: { id: "u-3", email_id: "x@x.com" }, token: "raw-string-jwt" },
    });
    getUserProfile.mockResolvedValueOnce({ data: { is_admin: false } });
    getCountries.mockResolvedValueOnce({ data: [] });

    render(<LoginPage />);
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(useStore.getState().user?.registered_language).toBe("en");
    expect(useStore.getState().user?.preferred_language).toBe("en");
    // Token: bare string is honoured too
    expect(useStore.getState().user?.token).toBe("raw-string-jwt");
  });

  it("token comes from body.token.access_token when it's an object", async () => {
    login.mockResolvedValueOnce({
      data: {
        user: { id: "u", email_id: "x@x.com" },
        token: { access_token: "jwt-xyz", token_type: "bearer" },
      },
    });
    getUserProfile.mockResolvedValueOnce({ data: {} });
    getCountries.mockResolvedValueOnce({ data: [] });

    render(<LoginPage />);
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(useStore.getState().user?.token).toBe("jwt-xyz");
  });

  it("resolves country_id + currency from getCountries lookup", async () => {
    login.mockResolvedValueOnce({
      data: {
        user: { id: "u", email_id: "x@x.com", country_id: "5" },
        token: { access_token: "t" },
      },
    });
    getUserProfile.mockResolvedValueOnce({ data: {} });
    getCountries.mockResolvedValueOnce({
      data: [
        { id: "1", currency: "INR" },
        { id: "5", currency: "VND" },
      ],
    });

    render(<LoginPage />);
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(useStore.getState().user?.currency).toBe("VND");
    expect(useStore.getState().user?.country_id).toBe("5");
  });
});

describe("Login — requires_pin_reset", () => {
  it("redirects to /set-new-pin, handing email + old PIN over in memory (never the URL)", async () => {
    login.mockResolvedValueOnce({
      data: { requires_pin_reset: true },
    });

    render(<LoginPage />);
    await fillForm("legacy@x.com", "1234");
    // Legacy 4-digit path — for the sake of triggering the flag, use 4 digits
    // via manual pin state; but our fillForm above uses 6. That's fine — the
    // guard is server-side. What matters is that when the server returns
    // requires_pin_reset, we redirect.
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));
    await waitFor(() => expect(replace).toHaveBeenCalled());

    const dest = replace.mock.calls[0][0] as string;
    expect(dest).toBe("/set-new-pin");
    expect(useStore.getState().pendingPinReset?.email).toBe("legacy@x.com");
    expect(useStore.getState().pendingPinReset?.oldPin).toMatch(/^\d+$/);
  });
});

describe("Login — error path", () => {
  it("shows a snackbar on API failure and stays on /login", async () => {
    login.mockRejectedValueOnce(new Error("Invalid credentials"));

    render(<LoginPage />);
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toContain("Invalid credentials");
    });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("Login — role, language and expiry from the login response (audit A-08 / A-14)", () => {
  it("uses is_admin + preferred_language from the login user and skips the public profile lookup", async () => {
    getCountries.mockResolvedValue({ data: [] });
    login.mockResolvedValueOnce({
      data: {
        user: {
          id: "u9",
          name: "A",
          email_id: "a@dg.org",
          is_admin: true,
          preferred_language: "hi",
        },
        token: { access_token: "jwt-1", token_type: "bearer", expires_in: 3600 },
      },
    });
    render(<LoginPage />);
    await fillForm("a@dg.org");
    const before = Date.now();
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cattle-info"));

    expect(getUserProfile).not.toHaveBeenCalled();
    const u = useStore.getState().user!;
    expect(u.is_admin).toBe(true);
    expect(u.preferred_language).toBe("hi");
    expect(u.token_expires_at).toBeGreaterThanOrEqual(before + 3_600_000);
  });
});

describe("Login — no account enumeration (audit A-19)", () => {
  it("shows the same generic message for an unknown email and a wrong PIN", async () => {
    for (const detail of [
      "User not found. Please check the email address entered.",
      "Invalid PIN",
    ]) {
      const err = Object.assign(new Error(detail), { status: 401 });
      login.mockRejectedValueOnce(err);
      const { unmount } = render(<LoginPage />);
      await fillForm("who@dg.org");
      fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));
      await waitFor(() =>
        expect(useStore.getState().snackbar?.message).toBe("Email or PIN is incorrect.")
      );
      unmount();
    }
  });

  it("answers an unknown email on Forgot PIN like a successful send", async () => {
    resetPin.mockRejectedValueOnce(
      Object.assign(new Error("Email address not found in our system."), { status: 404 })
    );
    render(<LoginPage />);
    fireEvent.click(screen.getByText(/Tap here/));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[inputs.length - 1], { target: { value: "who@dg.org" } });
    const buttons = screen.getAllByRole("button", { name: /Reset PIN|Proceed|Send/ });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(useStore.getState().snackbar).toEqual(
        expect.objectContaining({
          type: "success",
          message: "If an account exists for this email, a PIN reset link has been sent.",
        })
      )
    );
  });
});

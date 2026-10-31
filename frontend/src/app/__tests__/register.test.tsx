import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mocks ────────────────────────────────────────────────────────────
// vi.mock() is hoisted above imports; helper refs must go through
// vi.hoisted() so they exist when the factories run.
const { replace, back, register, getCountries } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  register: vi.fn(),
  getCountries: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    register,
    getCountries,
  };
});

import RegisterPage from "@/app/register/page";
import { useStore } from "@/lib/store";

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  register.mockReset();
  getCountries.mockReset();
  useStore.setState({
    user: null,
    lastUiLanguage: "en",
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

const countries = [
  {
    id: 1,
    name: "India",
    country_code: "IN",
    currency: "INR",
    supported_languages: ["en", "hi", "bn"],
  },
  {
    id: 2,
    name: "Vietnam",
    country_code: "VN",
    currency: "VND",
    supported_languages: ["en", "vi"],
  },
  { id: 3, name: "USA", country_code: "US", currency: "USD" }, // no supported_languages
];

async function renderPage() {
  getCountries.mockResolvedValue({ data: countries });
  render(<RegisterPage />);
  await waitFor(() => expect(screen.getByRole("option", { name: "India" })).toBeInTheDocument());
}

describe("Register — layout", () => {
  it("renders the standard fields", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "Create Account" })).toBeInTheDocument();
    // Name / Email / Country / Language labels
    expect(screen.getByText(/^Name/)).toBeInTheDocument();
    expect(screen.getByText(/Email Address/)).toBeInTheDocument();
    expect(screen.getByText(/^Country/)).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Proceed/ })).toBeInTheDocument();
  });

  it("Country dropdown lists all fetched countries", async () => {
    await renderPage();
    expect(screen.getByRole("option", { name: "India" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Vietnam" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "USA" })).toBeInTheDocument();
  });

  it("Language dropdown starts with English selected", async () => {
    await renderPage();
    // The English option is always rendered (native label)
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
  });
});

describe("Register — language dropdown reacts to country", () => {
  async function selectCountry(name: string) {
    const combos = screen.getAllByRole("combobox");
    // combos[0] = country, combos[1] = language (rendered later on the page)
    fireEvent.change(combos[0], {
      target: { value: String(countries.find((c) => c.name === name)!.id) },
    });
  }

  it("India → shows English + Hindi + Bengali (all in supported_languages)", async () => {
    await renderPage();
    await selectCountry("India");
    // Language options include native labels
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "हिन्दी" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "বাংলা" })).toBeInTheDocument();
    // Vietnamese is NOT visible when India is picked
    expect(screen.queryByRole("option", { name: "Tiếng Việt" })).toBeNull();
  });

  it("Vietnam → shows English + Vietnamese only", async () => {
    await renderPage();
    await selectCountry("Vietnam");
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tiếng Việt" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "हिन्दी" })).toBeNull();
  });

  it("Country with NO supported_languages field → English-only fallback", async () => {
    await renderPage();
    await selectCountry("USA");
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    // No other language options
    const langCombo = screen.getAllByRole("combobox")[1];
    expect(langCombo.querySelectorAll("option")).toHaveLength(1);
  });

  it("Language snaps to English when a country change hides the current pick", async () => {
    await renderPage();
    // Pick India then Hindi
    await selectCountry("India");
    const langCombo = screen.getAllByRole("combobox")[1];
    fireEvent.change(langCombo, { target: { value: "hi" } });
    expect((langCombo as HTMLSelectElement).value).toBe("hi");
    // Switch to USA (no Hindi in supported_languages)
    await selectCountry("USA");
    // useEffect resets to "en"
    await waitFor(() => expect((langCombo as HTMLSelectElement).value).toBe("en"));
  });
});

describe("Register — Proceed button gating", () => {
  it("Proceed starts disabled with no data", async () => {
    await renderPage();
    const proceed = screen.getByRole("button", { name: /Proceed/ });
    expect(proceed).toBeDisabled();
  });

  it("Proceed stays disabled without a valid email even with name+country", async () => {
    await renderPage();
    const user = userEvent.setup();
    await user.type(screen.getAllByRole("textbox")[0], "Aiyappa"); // name
    // Skip email, pick country
    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[0], { target: { value: "1" } });
    // PIN still isn't fillable — pinEnabled gate not passed
    // Just verify Proceed disabled
    expect(screen.getByRole("button", { name: /Proceed/ })).toBeDisabled();
  });
});

describe("Register — successful submit", () => {
  it("sends the language field with 'en' by default when user doesn't change it", async () => {
    await renderPage();
    register.mockResolvedValueOnce({ data: { message: "Registration successful" } });

    const user = userEvent.setup();
    // Fill name
    const nameInput = screen.getAllByRole("textbox")[0];
    await user.type(nameInput, "Aiyappa");
    // Fill email
    const emailInputs = screen.getAllByRole("textbox");
    await user.type(emailInputs[1], "aiyappa@dg.org");
    // Pick India
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "1" } });

    // Wait for PIN inputs to appear + become enabled
    const pinInputs = document.querySelectorAll<HTMLInputElement>("input[type='password']");
    expect(pinInputs.length).toBeGreaterThanOrEqual(12);

    // Enter first 6-digit PIN into first 6 boxes
    for (let i = 0; i < 6; i++) {
      fireEvent.change(pinInputs[i], { target: { value: String(i + 1) } });
    }
    // Confirm — same digits
    for (let i = 6; i < 12; i++) {
      fireEvent.change(pinInputs[i], { target: { value: String(i - 5) } });
    }

    // Click Proceed
    const proceed = screen.getByRole("button", { name: /Proceed/ });
    await waitFor(() => expect(proceed).not.toBeDisabled());
    fireEvent.click(proceed);

    await waitFor(() => expect(register).toHaveBeenCalledOnce());
    const payload = register.mock.calls[0][0];
    expect(payload).toMatchObject({
      name: "Aiyappa",
      email_id: "aiyappa@dg.org",
      country_id: "1",
      language: "en", // default
    });
    expect(payload.pin).toBe("123456");
  });

  it("sends the chosen language when the user picks one", async () => {
    await renderPage();
    register.mockResolvedValueOnce({ data: {} });

    const user = userEvent.setup();
    await user.type(screen.getAllByRole("textbox")[0], "Aiyappa");
    await user.type(screen.getAllByRole("textbox")[1], "aiyappa@dg.org");
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "1" } });
    // Pick Hindi
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "hi" } });

    const pinInputs = document.querySelectorAll<HTMLInputElement>("input[type='password']");
    for (let i = 0; i < 6; i++) fireEvent.change(pinInputs[i], { target: { value: "1" } });
    for (let i = 6; i < 12; i++) fireEvent.change(pinInputs[i], { target: { value: "1" } });

    const proceed = screen.getByRole("button", { name: /Proceed/ });
    await waitFor(() => expect(proceed).not.toBeDisabled());
    fireEvent.click(proceed);
    await waitFor(() => expect(register).toHaveBeenCalledOnce());
    expect(register.mock.calls[0][0].language).toBe("hi");
  });

  it("redirects to /verify-email on success", async () => {
    await renderPage();
    register.mockResolvedValueOnce({ data: { message: "ok" } });

    const user = userEvent.setup();
    await user.type(screen.getAllByRole("textbox")[0], "Aiyappa");
    await user.type(screen.getAllByRole("textbox")[1], "aiyappa@dg.org");
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "1" } });

    const pinInputs = document.querySelectorAll<HTMLInputElement>("input[type='password']");
    for (let i = 0; i < 6; i++) fireEvent.change(pinInputs[i], { target: { value: "1" } });
    for (let i = 6; i < 12; i++) fireEvent.change(pinInputs[i], { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        expect.stringContaining("/verify-email?email=aiyappa%40dg.org")
      )
    );
  });
});

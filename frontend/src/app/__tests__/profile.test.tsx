import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { replace, back, updateUserProfile, deleteAccount, getCountries, resetPin, changePin } =
  vi.hoisted(() => ({
    replace: vi.fn(),
    back: vi.fn(),
    updateUserProfile: vi.fn(),
    deleteAccount: vi.fn(),
    getCountries: vi.fn(),
    resetPin: vi.fn(),
    changePin: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, updateUserProfile, deleteAccount, getCountries, resetPin, changePin };
});

import ProfilePage from "@/app/(main)/profile/page";
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
  // Default is "en" (matches the seedUser convention in i18n-ui.test.ts /
  // help.test.tsx) — UI-label translation (src/lib/i18n-ui.ts) lazy-loads
  // and caches each language's dictionary at module scope for the whole
  // test file's lifetime. Defaulting to "hi" here would warm the Hindi
  // cache on the very first render and silently flip every later test's
  // English text assertions (e.g. getByRole(/Update Profile/)) to Hindi.
  // Tests that need Hindi pass `{ preferred_language: "hi" }` explicitly.
  registered_language: "en",
  preferred_language: "en",
  ...over,
});

const countries = [
  {
    id: "1",
    name: "India",
    country_code: "IN",
    currency: "INR",
    supported_languages: ["en", "hi", "bn"],
  },
  {
    id: "2",
    name: "Vietnam",
    country_code: "VN",
    currency: "VND",
    supported_languages: ["en", "vi"],
  },
  { id: "3", name: "USA", country_code: "US", currency: "USD" },
];

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  updateUserProfile.mockReset();
  getCountries.mockReset();
  useStore.setState({
    user: seedUser(),
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

async function renderReady() {
  getCountries.mockResolvedValueOnce({ data: countries });
  render(<ProfilePage />);
  // Wait for the loaded state (Name input rendered as textbox)
  await waitFor(() => expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0));
}

describe("Profile — loading shimmer (real fields in place, not a separate skeleton)", () => {
  it("shimmers the real Name/Country/Language fields while countries are fetching, then the same elements become interactive", async () => {
    let resolveCountries!: (v: { data: typeof countries }) => void;
    getCountries.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCountries = resolve;
      })
    );
    const { container } = render(<ProfilePage />);

    // Same real labels/fields mounted immediately — no separate skeleton.
    expect(screen.getByText(/^Name/)).toBeInTheDocument();
    expect(screen.getByText(/^Country/)).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();

    // Name input: disabled + shimmering, text hidden.
    const nameInput = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    expect(nameInput).toBeDisabled();
    expect(nameInput.className).toContain("shimmer");

    // Country + Language selects: disabled + shimmering.
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBe(2);
    selects.forEach((sel) => {
      expect(sel).toBeDisabled();
      expect(sel.className).toContain("shimmer");
    });

    resolveCountries({ data: countries });

    // Once resolved, the SAME elements become interactive.
    await waitFor(() => expect(nameInput).not.toBeDisabled());
    expect(nameInput.className).not.toContain("shimmer");
    container.querySelectorAll("select").forEach((sel) => {
      expect(sel).not.toBeDisabled();
      expect(sel.className).not.toContain("shimmer");
    });
    expect(container.querySelectorAll(".shimmer").length).toBe(0);
  });
});

describe("Profile — loaded state", () => {
  it("renders Name / Country / Language inputs", async () => {
    await renderReady();
    expect(screen.getAllByRole("textbox")[0]).toHaveValue("Aiyappa");
    // Country + Language dropdowns render as combobox
    const combos = screen.getAllByRole("combobox");
    expect(combos.length).toBe(2);
  });

  it("Language dropdown ALWAYS has English, even when country supports only English (or fewer)", async () => {
    // Load ready then flip country to USA (no supported_languages)
    await renderReady();
    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[0], { target: { value: "3" } }); // USA
    // Language should still have English available
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
  });

  it("India → English + Hindi + Bengali in Language dropdown", async () => {
    // Seed a user on India; countries mock already includes hi/bn.
    await renderReady();
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "हिन्दी" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "বাংলা" })).toBeInTheDocument();
    // No Vietnamese
    expect(screen.queryByRole("option", { name: "Tiếng Việt" })).toBeNull();
  });
});

describe("Profile — Update Profile call", () => {
  it("payload includes name + country_id + preferred_language (persists across sessions)", async () => {
    await renderReady();
    updateUserProfile.mockResolvedValueOnce({ data: {} });

    // Change name and language, then Update
    const nameInput = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "New Name" } });
    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[1], { target: { value: "en" } });

    const update = screen.getByRole("button", { name: /Update Profile/ });
    await waitFor(() => expect(update).not.toBeDisabled());
    fireEvent.click(update);

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledOnce());
    const [, payload] = updateUserProfile.mock.calls[0];
    // Contract: language change PERSISTS via the API now.
    expect(payload).toEqual({
      name: "New Name",
      country_id: "1",
      preferred_language: "en",
    });
  });

  it("updating language ALONE still enables Save (canSave includes language change)", async () => {
    await renderReady();
    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[1], { target: { value: "bn" } });
    // Update Profile should now be enabled
    const update = screen.getByRole("button", { name: /Update Profile/ });
    await waitFor(() => expect(update).not.toBeDisabled());
  });

  it("Save mutates preferred_language locally (and it persists via the API)", async () => {
    await renderReady();
    updateUserProfile.mockResolvedValueOnce({ data: {} });

    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[1], { target: { value: "bn" } });
    const update = screen.getByRole("button", { name: /Update Profile/ });
    await waitFor(() => expect(update).not.toBeDisabled());
    fireEvent.click(update);
    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledOnce());

    // Store reflects the new choice for the current session.
    // Backend has been notified via updateUserProfile so a subsequent
    // login returns the same value.
    expect(useStore.getState().user?.preferred_language).toBe("bn");
    // registered_language is now legacy — carried through unchanged.
  });

  it("changing country carries the currency through to setUser", async () => {
    await renderReady();
    updateUserProfile.mockResolvedValueOnce({ data: {} });

    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[0], { target: { value: "2" } }); // Vietnam
    const update = screen.getByRole("button", { name: /Update Profile/ });
    await waitFor(() => expect(update).not.toBeDisabled());
    fireEvent.click(update);
    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledOnce());

    const u = useStore.getState().user!;
    expect(u.country).toBe("Vietnam");
    expect(u.country_id).toBe("2");
    expect(u.country_code).toBe("VN");
    expect(u.currency).toBe("VND");
  });
});

describe("Profile — Update Profile disabled by default", () => {
  it("Update button starts disabled (no changes yet)", async () => {
    await renderReady();
    const update = screen.getByRole("button", { name: /Update Profile/ });
    expect(update).toBeDisabled();
  });

  it("empty name blocks Save even with country change", async () => {
    await renderReady();
    const nameInput = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "" } });
    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[0], { target: { value: "2" } });
    // canSave requires non-empty name
    const update = screen.getByRole("button", { name: /Update Profile/ });
    expect(update).toBeDisabled();
  });
});

// UI-label translation (src/lib/i18n-ui.ts) — SEPARATE from the feed-data
// i18n V2 system exercised above (Country/Language dropdown options).
// useT() resolves off the SAVED user.preferred_language in the store, not
// the pending/unsaved `selectedLang` dropdown state — see profile/page.tsx
// handleSave. The "hi" dictionary lazy-loads via dynamic import(), so
// these tests use findBy* to wait for it rather than assuming it's warm.
describe("Profile — UI-label translation", () => {
  it("translates the toolbar title, a field label, and the Update Profile button when user.preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    await renderReady();

    await screen.findByText("आपकी प्रोफ़ाइल"); // Your Profile (toolbar title)
    expect(screen.getByText("नाम *")).toBeInTheDocument(); // Name *
    expect(screen.getByRole("button", { name: /प्रोफ़ाइल अपडेट करें/ })).toBeInTheDocument(); // Update Profile
    expect(screen.queryByText("Your Profile")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Update Profile/ })).not.toBeInTheDocument();
  });

  it("picking a new Language in the dropdown does NOT retranslate the page before Save is clicked", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    await renderReady();
    // Wait for the Hindi dictionary to finish loading and render.
    await screen.findByRole("button", { name: /प्रोफ़ाइल अपडेट करें/ });

    // Pick a different (unsaved) language from the dropdown — combos[1]
    // is the Language select (combos[0] is Country).
    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[1], { target: { value: "en" } });

    // Nothing has been saved yet — the store's preferred_language is
    // still "hi", so useT() must keep rendering Hindi labels.
    expect(screen.getByRole("button", { name: /प्रोफ़ाइल अपडेट करें/ })).toBeInTheDocument();
    expect(screen.getByText("आपकी प्रोफ़ाइल")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Update Profile/ })).not.toBeInTheDocument();
  });

  it("labels flip to the newly picked language only after Save succeeds", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    await renderReady();
    await screen.findByRole("button", { name: /प्रोफ़ाइल अपडेट करें/ });
    updateUserProfile.mockResolvedValueOnce({ data: {} });

    // Change name (so canSave is true) and pick English in the Language
    // dropdown, then Save.
    const nameInput = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "New Name" } });
    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[1], { target: { value: "en" } });

    const update = screen.getByRole("button", { name: /प्रोफ़ाइल अपडेट करें/ });
    fireEvent.click(update);
    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledOnce());

    // Store now reflects "en" -> labels render in English post-save.
    expect(useStore.getState().user?.preferred_language).toBe("en");
    await screen.findByText("Your Profile");
    expect(screen.getByRole("button", { name: /^Update Profile/ })).toBeInTheDocument();
  });
});

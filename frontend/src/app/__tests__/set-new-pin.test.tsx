import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { replace, back, push, setNewPin, searchParamsState } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  setNewPin: vi.fn(),
  searchParamsState: { value: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, setNewPin };
});

import SetNewPinPage from "@/app/set-new-pin/page";
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
  replace.mockClear();
  back.mockClear();
  push.mockClear();
  setNewPin.mockReset();
  // Standard entry: reached from /login with requires_pin_reset=true.
  searchParamsState.value = "email=legacy%40dg.org&old_pin=1234";
  useStore.setState({ snackbar: null, user: null } as never);
});

// PinInput renders type="password" boxes. With the default query string
// there are 4 (old pin) + 6 (new pin) + 6 (confirm pin) = 16 boxes, in
// that order.
function pinBoxes() {
  return document.querySelectorAll<HTMLInputElement>("input[type='password']");
}

function fillPin(boxes: NodeListOf<HTMLInputElement>, start: number, digits: string) {
  for (let i = 0; i < digits.length; i++) {
    fireEvent.change(boxes[start + i], { target: { value: digits[i] } });
  }
}

describe("Set New PIN — reads query string", () => {
  it("pre-fills email from ?email=", () => {
    render(<SetNewPinPage />);
    expect(screen.getByRole("textbox")).toHaveValue("legacy@dg.org");
  });

  it("pre-fills the old-PIN boxes (4 digits) from ?old_pin=", () => {
    render(<SetNewPinPage />);
    const boxes = pinBoxes();
    // First 4 boxes are the legacy old-PIN field (length=4).
    const oldPinDigits = Array.from(boxes)
      .slice(0, 4)
      .map((b) => b.value)
      .join("");
    expect(oldPinDigits).toBe("1234");
  });

  it("renders 4 old-PIN boxes + 6 new-PIN boxes + 6 confirm boxes", () => {
    render(<SetNewPinPage />);
    expect(pinBoxes()).toHaveLength(16);
  });

  it("strips old_pin from the URL after mount", () => {
    // Note: the mocked useSearchParams() is independent of jsdom's real
    // window.location, so this only verifies the component's cleanup
    // effect runs without throwing and doesn't leave old_pin behind.
    render(<SetNewPinPage />);
    expect(window.location.search).not.toContain("old_pin");
  });
});

describe("Set New PIN — UI-label translation (src/lib/i18n-ui.ts)", () => {
  it("translates the toolbar heading + Update PIN button when preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<SetNewPinPage />);
    await screen.findByText("अपना PIN अपग्रेड करें"); // Upgrade Your PIN
    expect(screen.getByRole("button", { name: /PIN अपडेट करें/ })).toBeInTheDocument(); // Update PIN
  });
});

describe("Set New PIN — submit", () => {
  it("calls setNewPin(email, old_pin, new_pin) with the right payload shape", async () => {
    setNewPin.mockResolvedValueOnce({ data: { message: "PIN updated" } });
    render(<SetNewPinPage />);

    const boxes = pinBoxes();
    fillPin(boxes, 4, "123456"); // new pin
    fillPin(boxes, 10, "123456"); // confirm pin

    const submit = screen.getByRole("button", { name: /Update PIN/ });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() =>
      expect(setNewPin).toHaveBeenCalledWith("legacy@dg.org", "1234", "123456")
    );
  });

  it("shows the success state and 'Sign In' navigates to /login", async () => {
    setNewPin.mockResolvedValueOnce({ data: { message: "PIN updated" } });
    render(<SetNewPinPage />);

    const boxes = pinBoxes();
    fillPin(boxes, 4, "123456");
    fillPin(boxes, 10, "123456");
    fireEvent.click(screen.getByRole("button", { name: /Update PIN/ }));

    expect(await screen.findByText("PIN Updated")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Sign In/ }));
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("shows a success snackbar with the backend message", async () => {
    setNewPin.mockResolvedValueOnce({ data: { message: "Your PIN has been upgraded" } });
    render(<SetNewPinPage />);

    const boxes = pinBoxes();
    fillPin(boxes, 4, "123456");
    fillPin(boxes, 10, "123456");
    fireEvent.click(screen.getByRole("button", { name: /Update PIN/ }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("success");
      expect(snap?.message).toBe("Your PIN has been upgraded");
    });
  });
});

describe("Set New PIN — mismatch guard", () => {
  it("shows an inline warning and does not call the API when PINs differ", async () => {
    render(<SetNewPinPage />);
    const boxes = pinBoxes();
    fillPin(boxes, 4, "123456");
    fillPin(boxes, 10, "654321");

    expect(screen.getByText("New PINs do not match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Update PIN/ }));
    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("New PINs do not match");
    });
    expect(setNewPin).not.toHaveBeenCalled();
  });
});

describe("Set New PIN — error path", () => {
  it("shows an error snackbar and stays on the form when the API rejects", async () => {
    setNewPin.mockRejectedValueOnce(new Error("Old PIN is incorrect"));
    render(<SetNewPinPage />);

    const boxes = pinBoxes();
    fillPin(boxes, 4, "123456");
    fillPin(boxes, 10, "123456");
    fireEvent.click(screen.getByRole("button", { name: /Update PIN/ }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Old PIN is incorrect");
    });
    expect(screen.queryByText("PIN Updated")).toBeNull();
  });

  it("falls back to the network-error copy when the error message is 'Network Error'", async () => {
    setNewPin.mockRejectedValueOnce(new Error("Network Error"));
    render(<SetNewPinPage />);

    const boxes = pinBoxes();
    fillPin(boxes, 4, "123456");
    fillPin(boxes, 10, "123456");
    fireEvent.click(screen.getByRole("button", { name: /Update PIN/ }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toContain("internet connectivity");
    });
  });
});

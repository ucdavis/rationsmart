import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { replace, back, push, resetPin } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  resetPin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, resetPin };
});

import ForgotPinPage from "@/app/forgot-pin/page";
import { useStore } from "@/lib/store";

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  push.mockClear();
  resetPin.mockReset();
  useStore.setState({ snackbar: null, user: null, lastUiLanguage: "en" } as never);
});

describe("Forgot PIN — layout / gating", () => {
  it("Proceed is disabled with an empty or invalid email", async () => {
    render(<ForgotPinPage />);
    const proceed = screen.getByRole("button", { name: /Proceed/ });
    expect(proceed).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "not-an-email");
    expect(screen.getByRole("button", { name: /Proceed/ })).toBeDisabled();
  });

  it("Proceed becomes enabled once a valid email is entered", async () => {
    render(<ForgotPinPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "aiyappa@dg.org");
    expect(screen.getByRole("button", { name: /Proceed/ })).not.toBeDisabled();
  });

  it("back button navigates via router.back()", () => {
    render(<ForgotPinPage />);
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(back).toHaveBeenCalled();
  });
});

describe("Forgot PIN — successful submit", () => {
  it("calls resetPin(email) and shows the success state", async () => {
    resetPin.mockResolvedValueOnce({ data: { message: "PIN reset email sent" } });

    render(<ForgotPinPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "aiyappa@dg.org");
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));

    await waitFor(() => expect(resetPin).toHaveBeenCalledWith("aiyappa@dg.org"));

    expect(await screen.findByText("Check Your Email")).toBeInTheDocument();
    expect(
      screen.getByText(/We've sent PIN reset instructions/)
    ).toBeInTheDocument();

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("success");
      expect(snap?.message).toBe("PIN reset email sent");
    });
  });

  it("'Back to Login' navigates to /login", async () => {
    resetPin.mockResolvedValueOnce({ data: {} });

    render(<ForgotPinPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "aiyappa@dg.org");
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));

    const backToLogin = await screen.findByRole("button", { name: /Back to Login/ });
    fireEvent.click(backToLogin);
    expect(push).toHaveBeenCalledWith("/login");
  });
});

describe("Forgot PIN — error path", () => {
  it("shows an error snackbar and stays on the form when the API rejects", async () => {
    resetPin.mockRejectedValueOnce(new Error("No account found for this email"));

    render(<ForgotPinPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "aiyappa@dg.org");
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("No account found for this email");
    });

    // Stays on the form — success heading never renders
    expect(screen.queryByText("Check Your Email")).toBeNull();
    expect(screen.getByRole("button", { name: /Proceed/ })).toBeInTheDocument();
  });

  it("falls back to the network-error copy when the error message is 'Network Error'", async () => {
    resetPin.mockRejectedValueOnce(new Error("Network Error"));

    render(<ForgotPinPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "aiyappa@dg.org");
    fireEvent.click(screen.getByRole("button", { name: /Proceed/ }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toContain("internet connectivity");
    });
  });
});

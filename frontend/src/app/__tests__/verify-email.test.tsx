import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { replace, back, push, resendVerification, searchParamsState } = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  resendVerification: vi.fn(),
  searchParamsState: { value: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back, push }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, resendVerification };
});

import VerifyEmailPage from "@/app/verify-email/page";
import { useStore } from "@/lib/store";

beforeEach(() => {
  replace.mockClear();
  back.mockClear();
  push.mockClear();
  resendVerification.mockReset();
  searchParamsState.value = "";
  useStore.setState({ snackbar: null, user: null, lastUiLanguage: "en" } as never);
});

describe("Verify Email — layout", () => {
  it("pre-fills the email field from the ?email= query param", () => {
    searchParamsState.value = "email=aiyappa%40dg.org";
    render(<VerifyEmailPage />);
    expect(screen.getByRole("textbox")).toHaveValue("aiyappa@dg.org");
  });

  it("renders the Check Your Email heading and mail icon", () => {
    render(<VerifyEmailPage />);
    expect(screen.getByText("Check Your Email")).toBeInTheDocument();
    expect(screen.getByText(/verification link to your email/)).toBeInTheDocument();
  });

  it("Resend button is disabled with no/invalid email, enabled once valid", async () => {
    render(<VerifyEmailPage />);
    const resend = screen.getByRole("button", { name: /Resend Verification Email/ });
    expect(resend).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "aiyappa@dg.org");
    expect(screen.getByRole("button", { name: /Resend Verification Email/ })).not.toBeDisabled();
  });

  it("top back button navigates to /register", () => {
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(replace).toHaveBeenCalledWith("/register");
  });
});

describe("Verify Email — resend flow", () => {
  it("calls resendVerification(email) and shows a success snackbar", async () => {
    searchParamsState.value = "email=aiyappa%40dg.org";
    resendVerification.mockResolvedValueOnce({ data: { message: "Verification email sent again" } });

    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Resend Verification Email/ }));

    await waitFor(() => expect(resendVerification).toHaveBeenCalledWith("aiyappa@dg.org"));
    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("success");
      expect(snap?.message).toBe("Verification email sent again");
    });
  });

  it("shows a default success message when the API returns none", async () => {
    searchParamsState.value = "email=aiyappa%40dg.org";
    resendVerification.mockResolvedValueOnce({ data: {} });

    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Resend Verification Email/ }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("success");
      expect(snap?.message).toContain("Verification email resent");
    });
  });

  it("shows an error snackbar when resend fails (invalid / unverifiable email)", async () => {
    searchParamsState.value = "email=aiyappa%40dg.org";
    resendVerification.mockRejectedValueOnce(new Error("No pending verification for this email"));

    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Resend Verification Email/ }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("No pending verification for this email");
    });
  });
});

describe("Verify Email — Continue to Login", () => {
  it("navigates to /login", () => {
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Continue to Login/ }));
    expect(replace).toHaveBeenCalledWith("/login");
  });
});

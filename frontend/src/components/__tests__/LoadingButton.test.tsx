import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoadingButton from "@/components/ui/LoadingButton";
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
  preferred_language: "en",
  ...over,
});

beforeEach(() => {
  useStore.setState({ user: null });
});

describe("LoadingButton", () => {
  it("renders the label in the normal (non-loading) state", () => {
    render(<LoadingButton label="Save" />);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("isLoading=true swaps to the loadingLabel and shows a spinner", () => {
    render(<LoadingButton label="Save" isLoading loadingLabel="Saving..." />);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("isLoading=true with no loadingLabel falls back to the default 'Loading...'", () => {
    render(<LoadingButton label="Save" isLoading />);
    expect(screen.getByRole("button", { name: "Loading..." })).toBeInTheDocument();
  });

  it("isLoading=true renders the animate-spin svg", () => {
    const { container } = render(<LoadingButton label="Save" isLoading />);
    expect(container.querySelector("svg.animate-spin")).toBeTruthy();
  });

  it("isLoading=false does not render the spinner", () => {
    const { container } = render(<LoadingButton label="Save" />);
    expect(container.querySelector("svg.animate-spin")).toBeNull();
  });

  it("disabled=true disables the button", () => {
    render(<LoadingButton label="Save" disabled />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("isLoading=true also disables the button (even if disabled prop is false)", () => {
    render(<LoadingButton label="Save" isLoading disabled={false} />);
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();
  });

  it("fires onClick when enabled and not loading", () => {
    const onClick = vi.fn();
    render(<LoadingButton label="Save" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire onClick when isLoading (native disabled button suppresses click)", () => {
    const onClick = vi.fn();
    render(<LoadingButton label="Save" isLoading onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Loading..." }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(<LoadingButton label="Save" disabled onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type='button' (does not submit a form on click)", () => {
    render(<LoadingButton label="Save" />);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("honours an explicit type='submit'", () => {
    render(<LoadingButton label="Save" type="submit" />);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });

  it("variant='primary' (default, enabled) uses dark_aquamarine_green bg + white text", () => {
    render(<LoadingButton label="Save" />);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveStyle({ backgroundColor: "#064E3B", color: "#FFFFFF" });
  });

  it("variant='primary' disabled uses light_gray_new bg + spanish_gray text", () => {
    render(<LoadingButton label="Save" disabled />);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveStyle({ backgroundColor: "#D3D3D3", color: "#999999" });
  });

  it("variant='secondary' uses a transparent bg + bordered outline", () => {
    render(<LoadingButton label="Cancel" variant="secondary" />);
    const btn = screen.getByRole("button", { name: "Cancel" });
    // jsdom's getComputedStyle resolves "transparent" to "rgba(0, 0, 0, 0)"
    // in a way toHaveStyle's own normalization doesn't reconcile, so assert
    // on the raw inline style value instead.
    expect(btn.style.backgroundColor).toBe("transparent");
    expect(btn).toHaveStyle({ color: "#064E3B" });
    expect(btn.style.border).toBe("2px solid rgb(6, 78, 59)");
  });

  it("variant='danger' uses carmine_pink bg + white text", () => {
    render(<LoadingButton label="Delete" variant="danger" />);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn).toHaveStyle({ backgroundColor: "#E44A4A", color: "#FFFFFF" });
  });

  it("fullWidth defaults to true (width: 100%)", () => {
    render(<LoadingButton label="Save" />);
    expect(screen.getByRole("button", { name: "Save" })).toHaveStyle({ width: "100%" });
  });

  it("fullWidth=false renders width: auto", () => {
    render(<LoadingButton label="Save" fullWidth={false} />);
    expect(screen.getByRole("button", { name: "Save" })).toHaveStyle({ width: "auto" });
  });

  // UI-label translation (src/lib/i18n-ui.ts) — only the default
  // "Loading..." falls back through t(); a caller-supplied loadingLabel
  // (e.g. "Saving...") is dynamic content and is rendered as-is.
  it("translates the default 'Loading...' label when preferred_language is 'hi' and no loadingLabel prop is given", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<LoadingButton label="Save" isLoading />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "लोड हो रहा है..." })).toBeInTheDocument()
    );
  });

  it("does not translate a caller-supplied loadingLabel even when preferred_language is 'hi'", () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<LoadingButton label="Save" isLoading loadingLabel="Saving..." />);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
  });
});

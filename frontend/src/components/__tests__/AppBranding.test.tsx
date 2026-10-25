import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AppBranding from "@/components/AppBranding";
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

describe("AppBranding", () => {
  it("renders the RationSmart wordmark", () => {
    render(<AppBranding />);
    expect(screen.getByText("RationSmart")).toBeInTheDocument();
  });

  // UI-label translation (src/lib/i18n-ui.ts) — "RationSmart" is a
  // pass-through row in every locale (brand name isn't actually
  // translated), so this asserts no crash and the same visible wordmark
  // with a Hindi user signed in.
  it("still renders the RationSmart wordmark unchanged with preferred_language 'hi' (brand pass-through row)", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<AppBranding />);
    expect(await screen.findByText("RationSmart")).toBeInTheDocument();
  });

  it("renders the logo image with the expected alt text and src", () => {
    render(<AppBranding />);
    const img = screen.getByAltText("RationSmart") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    // next/image rewrites `src` through its loader; the original path
    // should still be embedded somewhere in the resulting URL.
    expect(img.src).toContain("app_logo.png");
  });

  it("wordmark uses the dark_aquamarine_green brand color", () => {
    render(<AppBranding />);
    expect(screen.getByText("RationSmart")).toHaveStyle({ color: "rgb(6, 78, 59)" });
  });
});

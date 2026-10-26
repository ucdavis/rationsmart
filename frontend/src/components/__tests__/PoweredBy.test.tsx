import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PoweredBy from "@/components/PoweredBy";
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

describe("PoweredBy", () => {
  it("renders 'POWERED BY' and 'DigitalGreen'", () => {
    render(<PoweredBy />);
    expect(screen.getByText("POWERED BY")).toBeInTheDocument();
    expect(screen.getByText("DigitalGreen")).toBeInTheDocument();
  });

  // UI-label translation (src/lib/i18n-ui.ts) — "POWERED BY" and
  // "DigitalGreen" are pass-through rows in every locale (brand names
  // aren't actually translated), so this asserts no crash and identical
  // visible text with a Hindi user signed in, not a different string.
  it("still renders 'POWERED BY' and 'DigitalGreen' unchanged with preferred_language 'hi' (brand pass-through row)", async () => {
    useStore.setState({ user: seedUser({ preferred_language: "hi" }) });
    render(<PoweredBy />);
    expect(await screen.findByText("POWERED BY")).toBeInTheDocument();
    expect(screen.getByText("DigitalGreen")).toBeInTheDocument();
  });

  it("'POWERED BY' uses the dark_silver label color", () => {
    render(<PoweredBy />);
    expect(screen.getByText("POWERED BY")).toHaveStyle({ color: "rgb(109, 109, 109)" });
  });

  it("'DigitalGreen' uses the dark_aquamarine_green brand color", () => {
    render(<PoweredBy />);
    expect(screen.getByText("DigitalGreen")).toHaveStyle({ color: "rgb(6, 78, 59)" });
  });
});

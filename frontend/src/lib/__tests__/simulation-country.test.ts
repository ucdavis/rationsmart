import { describe, it, expect } from "vitest";
import { simulationUser } from "@/lib/simulation-country";
import type { User } from "@/lib/store";

const user = {
  id: "u-1",
  name: "A",
  email: "a@dg.org",
  country: "India",
  country_id: "1",
  country_code: "IN",
  currency: "INR",
  token: "jwt",
} as User;

describe("simulationUser (N5)", () => {
  it("swaps in the simulation country and keeps the user's id", () => {
    expect(simulationUser(user, { country: "Ethiopia", country_id: "9" })).toMatchObject({
      id: "u-1",
      country: "Ethiopia",
      country_id: "9",
    });
    expect(user.country_id).toBe("1");
  });

  it("falls back to the profile when there is no simulation country", () => {
    expect(simulationUser(user, null)).toBe(user);
    expect(simulationUser(user, { country: "", country_id: "" })).toBe(user);
    expect(simulationUser(user, { country: "India", country_id: "1" })).toBe(user);
    expect(simulationUser(null, { country: "Ethiopia", country_id: "9" })).toBeNull();
  });
});

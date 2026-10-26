import { describe, it, expect, beforeEach } from "vitest";
import {
  cooldownSecondsLeft,
  markEmailSent,
  resetEmailCooldowns,
  EMAIL_ACTION_COOLDOWN_MS,
} from "@/lib/email-cooldown";

describe("email-action cooldown (audit A-20)", () => {
  beforeEach(() => resetEmailCooldowns());

  it("blocks a repeat send to the same address for 60 s, case-insensitively", () => {
    markEmailSent("reset-pin", "A@x.com", 1_000);
    expect(cooldownSecondsLeft("reset-pin", "a@x.com", 1_000)).toBe(60);
    expect(cooldownSecondsLeft("reset-pin", "a@x.com", 1_000 + EMAIL_ACTION_COOLDOWN_MS)).toBe(0);
  });

  it("is per action and per address", () => {
    markEmailSent("reset-pin", "a@x.com", 0);
    expect(cooldownSecondsLeft("resend-verification", "a@x.com", 0)).toBe(0);
    expect(cooldownSecondsLeft("reset-pin", "b@x.com", 0)).toBe(0);
  });
});

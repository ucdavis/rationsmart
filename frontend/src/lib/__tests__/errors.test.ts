import { describe, it, expect } from "vitest";
import { authErrorMessage, loginErrorMessage } from "@/lib/errors";
import { parseRetryAfter } from "@/lib/api-client/client";

const apiError = (status: number, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error("backend detail"), { status, ...extra });

describe("auth error messages — rate limiting and lockout (audit A-20)", () => {
  it("says how long to wait when the backend sent Retry-After", () => {
    expect(authErrorMessage(apiError(429, { retryAfter: 42 }), "fallback")).toBe(
      "Too many attempts — try again in 42 s."
    );
  });

  it("falls back to a generic wait message without Retry-After", () => {
    expect(authErrorMessage(apiError(429), "fallback")).toBe(
      "Too many attempts — please wait a moment and try again."
    );
  });

  it("explains a locked account (423), also on the login screen", () => {
    const msg = "This account is temporarily locked. Try again later or reset your PIN.";
    expect(authErrorMessage(apiError(423), "fallback")).toBe(msg);
    expect(loginErrorMessage(apiError(423), "fallback")).toBe(msg);
  });

  it("translates the message before filling in the seconds", () => {
    const t = (s: string) => (s.startsWith("Too many") ? "बहुत प्रयास — ${seconds} से." : s);
    expect(authErrorMessage(apiError(429, { retryAfter: 5 }), "fallback", t)).toBe(
      "बहुत प्रयास — 5 से."
    );
  });

  it("keeps the existing behaviour for other errors", () => {
    expect(authErrorMessage(apiError(400), "fallback")).toBe("backend detail");
    expect(loginErrorMessage(apiError(401), "fallback")).toBe("Email or PIN is incorrect.");
  });
});

describe("parseRetryAfter", () => {
  it("reads delta-seconds and HTTP dates", () => {
    expect(parseRetryAfter("120")).toBe(120);
    expect(parseRetryAfter(7)).toBe(7);
    const now = Date.parse("2026-09-30T10:00:00Z");
    expect(parseRetryAfter("Wed, 30 Sep 2026 10:00:45 GMT", now)).toBe(45);
  });

  it("never returns less than one second, and ignores junk", () => {
    expect(parseRetryAfter("0")).toBe(1);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
  });
});

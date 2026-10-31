import { describe, it, expect } from "vitest";
import {
  isEmailAddressValid,
  containsMultipleDecimalPoints,
  getDecimalPointIndex,
  calculateCost,
  formatFeedBreakdownData,
  toFeedReportDisplayDate,
  toAdminReportDisplayDate,
  cleanNameInput,
  formatTotalUsers,
  inclusionBoundsCrossed,
} from "@/lib/validators";

describe("isEmailAddressValid", () => {
  it.each([
    "test@example.com",
    "a@b.co",
    "user.name+tag@sub.example.org",
    "TEST@EXAMPLE.COM",
    "user_123@example-domain.com",
  ])("accepts %s", (email) => {
    expect(isEmailAddressValid(email)).toBe(true);
  });

  it.each([
    "",
    "plainaddress",
    "@missing-user.com",
    "no-at-sign.com",
    "user@no-tld",
    "spaces in@address.com",
    "user@@double.com",
    "user@.dot.com",
    "user@domain.a", // TLD must be at least 2 chars
  ])("rejects %s", (email) => {
    expect(isEmailAddressValid(email)).toBe(false);
  });
});

describe("containsMultipleDecimalPoints", () => {
  it("returns false when zero dots", () => {
    expect(containsMultipleDecimalPoints("123")).toBe(false);
  });
  it("returns false when exactly one dot", () => {
    expect(containsMultipleDecimalPoints("123.45")).toBe(false);
  });
  it("returns true when two dots", () => {
    expect(containsMultipleDecimalPoints("1.2.3")).toBe(true);
  });
  it("returns true when three dots", () => {
    expect(containsMultipleDecimalPoints("1.2.3.4")).toBe(true);
  });
  it("handles empty string", () => {
    expect(containsMultipleDecimalPoints("")).toBe(false);
  });
});

describe("getDecimalPointIndex", () => {
  it("returns 0 when zero dots", () => {
    expect(getDecimalPointIndex("123")).toBe(0);
  });
  it("returns 0 when one dot only", () => {
    expect(getDecimalPointIndex("12.3")).toBe(0);
  });
  it("returns the position of the SECOND dot", () => {
    expect(getDecimalPointIndex("1.2.3")).toBe(3);
    expect(getDecimalPointIndex("12.34.56")).toBe(5);
  });
});

describe("calculateCost", () => {
  it("multiplies two well-formed numbers", () => {
    expect(calculateCost("10", "3")).toBe("30");
  });
  it("returns 2-decimal fixed for non-integers", () => {
    expect(calculateCost("10.5", "2")).toBe("21");
    expect(calculateCost("2.5", "3")).toBe("7.50");
  });
  it("returns empty for missing price", () => {
    expect(calculateCost("", "3")).toBe("");
  });
  it("returns empty for missing quantity", () => {
    expect(calculateCost("10", "")).toBe("");
  });
  it("rounds HALF_UP exactly, like Android's BigDecimal (no float drift)", () => {
    expect(calculateCost("1.15", "3")).toBe("3.45");
    expect(calculateCost("0.05", "0.5")).toBe("0.03"); // 0.025 → 0.03
    expect(calculateCost("2.05", "0.5")).toBe("1.03"); // 1.025 → 1.03 (float gives 1.02)
    expect(calculateCost("10.1", "0.1")).toBe("1.01");
  });
  it("rejects strings with more than 2 decimals", () => {
    expect(calculateCost("10.123", "2")).toBe("");
  });
  it("rejects negative numbers (regex is unsigned)", () => {
    expect(calculateCost("-10", "2")).toBe("");
  });
  it("rounds to 2 decimals", () => {
    expect(calculateCost("1.05", "1.05")).toBe("1.10");
  });
});

describe("formatFeedBreakdownData", () => {
  it("returns empty string for null/undefined (differs from FeedSelection)", () => {
    expect(formatFeedBreakdownData(null)).toBe("");
    expect(formatFeedBreakdownData(undefined)).toBe("");
  });
  it("formats numbers same as selection helper", () => {
    expect(formatFeedBreakdownData(10)).toBe("10");
    expect(formatFeedBreakdownData(10.5)).toBe("10.50");
  });
});

describe("date formatters", () => {
  it("toFeedReportDisplayDate — '4 Jun 2026' style", () => {
    expect(toFeedReportDisplayDate("2026-06-04T00:00:00Z")).toBe("4 Jun 2026");
    expect(toFeedReportDisplayDate(null)).toBe("Not available");
  });
  it("toAdminReportDisplayDate — parses space-separated datetime", () => {
    expect(toAdminReportDisplayDate("2026-06-04 15:45:00")).toBe("4 Jun 2026");
    expect(toAdminReportDisplayDate(null)).toBe("Not available");
  });
});

describe("cleanNameInput", () => {
  it("strips leading whitespace", () => {
    expect(cleanNameInput("   John")).toBe("John");
  });
  it("preserves a single trailing space when the string has content", () => {
    // Android parity: allow user to type a space between words without
    // it being eaten immediately.
    expect(cleanNameInput("John ")).toBe("John ");
  });
  it("collapses multiple spaces to one", () => {
    expect(cleanNameInput("John    Doe")).toBe("John Doe");
  });
  it("removes digits", () => {
    expect(cleanNameInput("John123")).toBe("John");
  });
  it("removes special characters", () => {
    expect(cleanNameInput("Jo@hn!")).toBe("John");
  });
  it("keeps letters + spaces", () => {
    expect(cleanNameInput("Mary Jane")).toBe("Mary Jane");
  });
  it("handles empty string", () => {
    expect(cleanNameInput("")).toBe("");
  });
});

describe("formatTotalUsers", () => {
  it("adds grouping separators", () => {
    expect(formatTotalUsers(1000)).toBe("1,000");
    expect(formatTotalUsers(1234567)).toBe("1,234,567");
  });
  it("handles zero", () => {
    expect(formatTotalUsers(0)).toBe("0");
  });
});

describe("inclusionBoundsCrossed", () => {
  it("is true only when both bounds are set and min > max", () => {
    expect(inclusionBoundsCrossed(5, 2)).toBe(true);
    expect(inclusionBoundsCrossed(2, 2)).toBe(false);
    expect(inclusionBoundsCrossed(1, 2)).toBe(false);
    expect(inclusionBoundsCrossed(null, 2)).toBe(false);
    expect(inclusionBoundsCrossed(5, null)).toBe(false);
  });
});

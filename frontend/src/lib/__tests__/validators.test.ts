import { describe, it, expect } from "vitest";
import {
  isEmailAddressValid,
  daysInMilkIsInRange,
  daysOfPregnancyIsInRange,
  scoreIsInRange,
  bodyWeightIsInRange,
  bodyWeightGainIsInRange,
  milkProductionIsInRange,
  containsMultipleDecimalPoints,
  getDecimalPointIndex,
  calculateCost,
  formatFeedSelectionData,
  formatFeedBreakdownData,
  formatPrice,
  toDisplayDate,
  toFeedReportDisplayDate,
  toSimulationHistoryDisplayDate,
  toAdminReportDisplayDate,
  emptyStringOrValue,
  cleanNameInput,
  formatTotalUsers,
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

describe("range validators", () => {
  describe("daysInMilkIsInRange (0..400)", () => {
    it.each([0, 1, 200, 399, 400])("accepts %i", (n) => expect(daysInMilkIsInRange(n)).toBe(true));
    it.each([-1, 401, 999])("rejects %i", (n) => expect(daysInMilkIsInRange(n)).toBe(false));
  });

  describe("daysOfPregnancyIsInRange (0..280)", () => {
    it.each([0, 100, 279, 280])("accepts %i", (n) => expect(daysOfPregnancyIsInRange(n)).toBe(true));
    it.each([-1, 281, 400])("rejects %i", (n) => expect(daysOfPregnancyIsInRange(n)).toBe(false));
  });

  describe("scoreIsInRange (1..5)", () => {
    it.each([1, 1.0, 2.5, 4.9, 5, 5.0])("accepts %s", (n) => expect(scoreIsInRange(n)).toBe(true));
    it.each([0, 0.9, 5.1, 10, -1])("rejects %s", (n) => expect(scoreIsInRange(n)).toBe(false));
  });

  describe("bodyWeightIsInRange (350..720)", () => {
    it.each([350, 500, 719, 720])("accepts %i", (n) => expect(bodyWeightIsInRange(n)).toBe(true));
    it.each([349, 721, 0, 800])("rejects %i", (n) => expect(bodyWeightIsInRange(n)).toBe(false));
  });

  describe("bodyWeightGainIsInRange (0..1.8)", () => {
    it.each([0, 0.5, 1.0, 1.7, 1.8])("accepts %s", (n) => expect(bodyWeightGainIsInRange(n)).toBe(true));
    it.each([-0.1, 1.81, 2, 10])("rejects %s", (n) => expect(bodyWeightGainIsInRange(n)).toBe(false));
  });

  describe("milkProductionIsInRange (1..59)", () => {
    it.each([1, 20, 58, 59])("accepts %i", (n) => expect(milkProductionIsInRange(n)).toBe(true));
    it.each([0, 60, -5, 100])("rejects %i", (n) => expect(milkProductionIsInRange(n)).toBe(false));
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

describe("formatFeedSelectionData", () => {
  it("returns '0' for null/undefined", () => {
    expect(formatFeedSelectionData(null)).toBe("0");
    expect(formatFeedSelectionData(undefined)).toBe("0");
  });
  it("returns integer as string when whole", () => {
    expect(formatFeedSelectionData(10)).toBe("10");
    expect(formatFeedSelectionData(0)).toBe("0");
  });
  it("returns 2-decimal fixed for fractions", () => {
    expect(formatFeedSelectionData(10.5)).toBe("10.50");
    expect(formatFeedSelectionData(1.234)).toBe("1.23");
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

describe("formatPrice", () => {
  it("returns empty string for null/undefined", () => {
    expect(formatPrice(null)).toBe("");
    expect(formatPrice(undefined)).toBe("");
  });
  it("uses thousands grouping", () => {
    expect(formatPrice(1000000)).toBe("1,000,000");
  });
  it("preserves up to 2 decimals", () => {
    expect(formatPrice(1234.5)).toBe("1,234.5");
    expect(formatPrice(1234.56)).toBe("1,234.56");
  });
});

describe("date formatters", () => {
  it("toDisplayDate — returns dd/mm/yyyy for valid ISO", () => {
    expect(toDisplayDate("2026-06-04T00:00:00Z")).toBe("04/06/2026");
  });
  it("toDisplayDate — returns 'Not available' for null/empty/garbage", () => {
    expect(toDisplayDate(null)).toBe("Not available");
    expect(toDisplayDate("")).toBe("Not available");
    expect(toDisplayDate("not a date")).toBe("Not available");
  });
  it("toFeedReportDisplayDate — '4 Jun 2026' style", () => {
    expect(toFeedReportDisplayDate("2026-06-04T00:00:00Z")).toBe("4 Jun 2026");
    expect(toFeedReportDisplayDate(null)).toBe("Not available");
  });
  it("toSimulationHistoryDisplayDate — parses 'yyyy-MM-dd HH:mm:ss'", () => {
    const out = toSimulationHistoryDisplayDate("2026-06-04 15:45:00");
    expect(out).toContain("Jun 2026");
    expect(out).toContain("at");
    expect(out).toContain("PM");
  });
  it("toSimulationHistoryDisplayDate — 'Not available' for null", () => {
    expect(toSimulationHistoryDisplayDate(null)).toBe("Not available");
    expect(toSimulationHistoryDisplayDate("")).toBe("Not available");
  });
  it("toAdminReportDisplayDate — parses space-separated datetime", () => {
    expect(toAdminReportDisplayDate("2026-06-04 15:45:00")).toBe("4 Jun 2026");
    expect(toAdminReportDisplayDate(null)).toBe("Not available");
  });
});

describe("emptyStringOrValue", () => {
  it("returns empty for null/undefined/empty/'Select'", () => {
    expect(emptyStringOrValue(null)).toBe("");
    expect(emptyStringOrValue(undefined)).toBe("");
    expect(emptyStringOrValue("")).toBe("");
    expect(emptyStringOrValue("Select")).toBe("");
  });
  it("returns the value as-is otherwise", () => {
    expect(emptyStringOrValue("India")).toBe("India");
    expect(emptyStringOrValue("selected")).toBe("selected");
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

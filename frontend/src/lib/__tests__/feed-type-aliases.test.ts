import { describe, it, expect } from "vitest";
import {
  FORAGE_ALIASES,
  ROUGHAGE_ALIASES,
  isForageType,
  isRoughageType,
} from "@/lib/feed-type-aliases";

describe("FORAGE_ALIASES / ROUGHAGE_ALIASES", () => {
  it("FORAGE_ALIASES contains the English and Hindi labels", () => {
    expect(FORAGE_ALIASES.has("Forage")).toBe(true);
    expect(FORAGE_ALIASES.has("चारा")).toBe(true);
  });

  it("ROUGHAGE_ALIASES contains only the English label (no translation shipped yet)", () => {
    expect(ROUGHAGE_ALIASES.has("Roughage")).toBe(true);
    expect(ROUGHAGE_ALIASES.size).toBe(1);
  });
});

describe("isForageType", () => {
  it("returns true for the English identity value", () => {
    expect(isForageType("Forage")).toBe(true);
  });

  it("returns true for the Hindi translation", () => {
    expect(isForageType("चारा")).toBe(true);
  });

  it("returns false for an unrelated/unmapped type name", () => {
    expect(isForageType("Concentrate")).toBe(false);
  });

  it("returns false for a translation of a DIFFERENT type (Roughage's Hindi would not alias Forage)", () => {
    expect(isForageType("Roughage")).toBe(false);
  });

  it("returns false for null/undefined/empty input", () => {
    expect(isForageType(null)).toBe(false);
    expect(isForageType(undefined)).toBe(false);
    expect(isForageType("")).toBe(false);
  });

  it("is case-sensitive (no accidental loose matching)", () => {
    expect(isForageType("forage")).toBe(false);
    expect(isForageType("FORAGE")).toBe(false);
  });
});

describe("isRoughageType", () => {
  it("returns true for the English identity value", () => {
    expect(isRoughageType("Roughage")).toBe(true);
  });

  it("returns false for an unknown/unmapped input", () => {
    expect(isRoughageType("Silage")).toBe(false);
  });

  it("returns false for null/undefined/empty input", () => {
    expect(isRoughageType(null)).toBe(false);
    expect(isRoughageType(undefined)).toBe(false);
    expect(isRoughageType("")).toBe(false);
  });

  it("returns false for Forage's Hindi alias (cross-type isolation)", () => {
    expect(isRoughageType("चारा")).toBe(false);
  });
});

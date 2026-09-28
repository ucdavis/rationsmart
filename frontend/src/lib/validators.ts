// Ported from Android Ext.kt — keep in sync with server-side validation rules

export function isEmailAddressValid(email: string): boolean {
  const emailRegex = /^[A-Za-z0-9+_.%-]{1,256}@(?=.{1,255}$)([A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/;
  return emailRegex.test(email);
}

export function containsMultipleDecimalPoints(str: string): boolean {
  let count = 0;
  for (const c of str) {
    if (c === ".") {
      count++;
      if (count > 1) return true;
    }
  }
  return false;
}

export function getDecimalPointIndex(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ".") {
      count++;
      if (count === 2) return i;
    }
  }
  return 0;
}

// Android Ext.kt `String.calculateCost` parity: both inputs must have at most
// 2 decimals (otherwise "" — the input fields only allow 2), and the product
// is rounded HALF_UP to 2 decimals. Android uses BigDecimal; here the inputs
// are scaled to integer hundredths so the multiply and rounding are exact —
// plain float math turned e.g. 1.005-style products into x.4999… and rounded
// the wrong way (audit B-25).
export function calculateCost(price: string, quantity: string): string {
  if (!price || !quantity) return "";
  const regex = /^\d+(\.\d{1,2})?$/;
  if (!regex.test(price) || !regex.test(quantity)) return "";
  const toHundredths = (v: string) => {
    const [whole, frac = ""] = v.split(".");
    return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  };
  // product is in 1/10 000 units; + 50 then floor = HALF_UP to 1/100.
  const product = toHundredths(price) * toHundredths(quantity);
  if (!Number.isSafeInteger(product)) return "";
  const cents = Math.floor((product + 50) / 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

export function formatFeedBreakdownData(value: number | null | undefined): string {
  if (value == null) return "";
  const result = Math.round(value * 100) / 100;
  return result % 1 === 0 ? String(Math.round(result)) : result.toFixed(2);
}

export function toFeedReportDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "Not available";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Not available";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "Not available";
  }
}

export function toAdminReportDisplayDate(datetime: string | null | undefined): string {
  if (!datetime) return "Not available";
  try {
    const d = new Date(datetime.replace(" ", "T"));
    if (isNaN(d.getTime())) return "Not available";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "Not available";
  }
}

export function cleanNameInput(input: string): string {
  let cleaned = input.trimStart();
  if (cleaned.endsWith(" ") && cleaned.length > 1) {
    cleaned = cleaned.trimEnd() + " ";
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  cleaned = cleaned.replace(/[^a-zA-Z\s]/g, "");
  return cleaned;
}

export function formatTotalUsers(n: number): string {
  return new Intl.NumberFormat("en-US", { useGrouping: true }).format(n);
}

/**
 * A per-feed inclusion bound (`min_kg_asfed` / `max_kg_asfed`) that the
 * backend will reject.
 *
 * The v1 schema declares both as `exclusiveMinimum: 0`, so a 0 (or a
 * negative) comes back as a 422. Omitting the key is how you say "no bound";
 * a 0 can therefore only mean the user actively typed one — usually trying to
 * exclude a feed, which is done by removing the row instead.
 *
 * Deliberately NOT "coerce 0 to null": silently discarding what the user
 * typed is the defect this check exists to prevent, not the fix for it.
 */
export function inclusionBoundIsInvalid(value: number | null | undefined): boolean {
  return value != null && value <= 0;
}

/** True when both inclusion bounds are set and the minimum exceeds the maximum (backend 422s it). */
export function inclusionBoundsCrossed(
  min: number | null | undefined,
  max: number | null | undefined
): boolean {
  return min != null && max != null && min > max;
}

// PIN lengths. The v1 backend issues 6-digit PINs; legacy 4-digit PINs are
// accepted at login only, which then routes to /set-new-pin to upgrade.
export const PIN_LENGTH = 6;
export const LEGACY_PIN_LENGTH = 4;

// Feed nutrient composition is entered as % of dry matter (or of CP for
// NPN / NDIN / ADIN) — anything outside 0–100, or not a number, is a typo
// the backend would otherwise store (audit B-14). Blank means "0" (Android).
export const NUTRIENT_RANGE_MESSAGE = "Nutrient values must be numbers between 0 and 100 %.";

export function nutrientValueInvalid(v: string | number | null | undefined): boolean {
  if (v === null || v === undefined || v === "") return false;
  const n = typeof v === "number" ? v : Number(v);
  return !Number.isFinite(n) || n < 0 || n > 100;
}

/** True when any of `values` (a form's nutrient fields) is out of range. */
export function anyNutrientInvalid(values: Iterable<string | number | null | undefined>): boolean {
  for (const v of values) if (nutrientValueInvalid(v)) return true;
  return false;
}

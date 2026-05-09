// Ported from Android Ext.kt — keep in sync with server-side validation rules

export function isEmailAddressValid(email: string): boolean {
  const emailRegex =
    /^[A-Za-z0-9+_.%-]{1,256}@(?=.{1,255}$)([A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/;
  return emailRegex.test(email);
}

export function daysInMilkIsInRange(days: number): boolean {
  return days >= 0 && days <= 400;
}

export function daysOfPregnancyIsInRange(days: number): boolean {
  return days >= 0 && days <= 280;
}

export function scoreIsInRange(score: number): boolean {
  return score >= 1.0 && score <= 5.0;
}

export function bodyWeightIsInRange(weight: number): boolean {
  return weight >= 350 && weight <= 720;
}

export function bodyWeightGainIsInRange(gain: number): boolean {
  return gain >= 0 && gain <= 1.8;
}

export function milkProductionIsInRange(litres: number): boolean {
  return litres >= 1 && litres <= 59;
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

export function calculateCost(price: string, quantity: string): string {
  if (!price || !quantity) return "";
  const regex = /^\d+(\.\d{1,2})?$/;
  if (!regex.test(price) || !regex.test(quantity)) return "";
  const p = parseFloat(price);
  const q = parseFloat(quantity);
  if (isNaN(p) || isNaN(q)) return "";
  const result = Math.round(p * q * 100) / 100;
  return result % 1 === 0 ? String(Math.round(result)) : result.toFixed(2);
}

export function formatFeedSelectionData(value: number | null | undefined): string {
  if (value == null) return "0";
  const result = Math.round(value * 100) / 100;
  return result % 1 === 0 ? String(Math.round(result)) : result.toFixed(2);
}

export function formatFeedBreakdownData(value: number | null | undefined): string {
  if (value == null) return "";
  const result = Math.round(value * 100) / 100;
  return result % 1 === 0 ? String(Math.round(result)) : result.toFixed(2);
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "";
  const result = Math.round(value * 100) / 100;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(result);
  return formatted;
}

export function toDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "Not available";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Not available";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "Not available";
  }
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

export function toSimulationHistoryDisplayDate(datetime: string | null | undefined): string {
  if (!datetime) return "Not available";
  try {
    // "yyyy-MM-dd HH:mm:ss" — replace space with T for ISO parsing
    const d = new Date(datetime.replace(" ", "T"));
    if (isNaN(d.getTime())) return "Not available";
    const datePart = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${datePart} at ${timePart}`;
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

export function emptyStringOrValue(value: string | null | undefined): string {
  if (!value || value === "Select") return "";
  return value;
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

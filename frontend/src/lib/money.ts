// Money arithmetic for the report (audit B-25). Summing floats and then
// formatting with toFixed can drift by a cent (0.1 + 0.2 ≠ 0.3) and can
// round a half-cent the wrong way; totals should also equal the sum of the
// rounded line values the user sees. Everything here works in integer cents.

const toCents = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100 + (n >= 0 ? 1e-7 : -1e-7)) : 0;
};

/** Sum of amounts, each rounded to the cent first (matches the displayed lines). */
export function sumMoney(values: Iterable<unknown>): number {
  let cents = 0;
  for (const v of values) cents += toCents(v);
  return cents / 100;
}

/** Rounds an amount to the cent (half away from zero). */
export function roundMoney(v: unknown): number {
  return toCents(v) / 100;
}

/** Amount as a 2-decimal string, e.g. 1.005 → "1.01". */
export function formatMoney(v: unknown): string {
  return roundMoney(v).toFixed(2);
}

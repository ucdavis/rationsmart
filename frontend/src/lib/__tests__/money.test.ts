import { describe, it, expect } from "vitest";
import { formatMoney, roundMoney, sumMoney } from "@/lib/money";

describe("money (audit B-25)", () => {
  it("sums in cents, so float drift can't show up", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([1.005, 2.005])).toBe(3.02); // each line rounds like the table shows it
    expect(sumMoney(["12.5", null, undefined, "x"])).toBe(12.5);
  });

  it("rounds half-cents away from zero", () => {
    expect(formatMoney(1.005)).toBe("1.01");
    expect(formatMoney(-1.005)).toBe("-1.01");
    expect(roundMoney(2.675)).toBe(2.68);
  });
});

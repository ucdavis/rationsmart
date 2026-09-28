import { describe, it, expect, vi } from "vitest";
import { collectPages } from "@/lib/pagination";

const page = (n: number, size: number) => Array.from({ length: size }, (_, i) => `${n}-${i}`);

describe("collectPages (audit B-10)", () => {
  it("keeps fetching until a short page and concatenates every item", async () => {
    const fetchPage = vi.fn(async (p: number) => ({
      data: { items: p < 3 ? page(p, 100) : page(p, 7) },
    }));
    const all = await collectPages(fetchPage, (d) => (d as { items: string[] }).items);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(all).toHaveLength(207);
  });

  it("stops at total_pages even when the last page is full", async () => {
    const fetchPage = vi.fn(async (p: number) => ({
      data: { items: page(p, 100), total_pages: 2 },
    }));
    const all = await collectPages(fetchPage, (d) => (d as { items: string[] }).items);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(all).toHaveLength(200);
  });

  it("stops at total_count", async () => {
    const fetchPage = vi.fn(async (p: number) => ({
      data: { items: page(p, 100), total_count: 100 },
    }));
    await collectPages(fetchPage, (d) => (d as { items: string[] }).items);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("has a hard page cap", async () => {
    const fetchPage = vi.fn(async (p: number) => ({ data: { items: page(p, 100) } }));
    await collectPages(fetchPage, (d) => (d as { items: string[] }).items);
    expect(fetchPage).toHaveBeenCalledTimes(50);
  });

  it("propagates a failed page instead of returning a partial list", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: { items: page(1, 100) } })
      .mockRejectedValueOnce(new Error("boom"));
    await expect(collectPages(fetchPage, (d) => (d as { items: string[] }).items)).rejects.toThrow(
      "boom"
    );
  });
});

describe("allSettledLimited (audit B-11)", () => {
  it("never runs more than `limit` at once and keeps result order", async () => {
    const { allSettledLimited } = await import("@/lib/concurrency");
    let active = 0;
    let peak = 0;
    const results = await allSettledLimited([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      if (n === 4) throw new Error("bad");
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : "x"))).toEqual([
      10,
      20,
      30,
      "x",
      50,
      60,
      70,
      80,
    ]);
  });
});

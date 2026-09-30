// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "@/app/api/feed-template/route";

afterEach(() => vi.unstubAllGlobals());

describe("/api/feed-template (audit C-07)", () => {
  it("streams the template same-origin as an attachment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("feeds_table_template.xlsx");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns 502 when storage is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 403 }))
    );
    expect((await GET()).status).toBe(502);
  });
});

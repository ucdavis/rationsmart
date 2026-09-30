// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, POST } from "@/app/api/session/route";

const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/session", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("/api/session (audit A-04)", () => {
  it("POST moves a legacy token into the httpOnly cookie", async () => {
    const res = await POST(req("POST", { token: "a.b.c", expires_in: 120 }));
    expect(res.status).toBe(200);
    const c = res.headers.get("set-cookie") ?? "";
    expect(c).toContain("rs_session=a.b.c");
    expect(c.toLowerCase()).toContain("httponly");
    expect(c).toContain("Max-Age=120");
  });

  it("POST rejects anything that isn't a JWT, and cross-origin calls", async () => {
    expect((await POST(req("POST", { token: "nope" }))).status).toBe(400);
    expect(
      (await POST(req("POST", { token: "a.b.c" }, { origin: "https://evil.example" }))).status
    ).toBe(403);
  });

  it("DELETE clears the cookie", async () => {
    const res = await DELETE(req("DELETE"));
    expect(res.headers.get("set-cookie") ?? "").toMatch(/rs_session=;.*Max-Age=0/);
  });
});

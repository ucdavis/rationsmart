// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
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

describe("/api/session DELETE — upstream token revocation (audit A-14)", () => {
  it("asks the backend to revoke the session token, then clears the cookie", async () => {
    process.env.BACKEND_HOST = "backend.test";
    vi.resetModules();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    });
    const { DELETE: del } = await import("@/app/api/session/route");
    const res = await del(req("DELETE", undefined, { cookie: "rs_session=a.b.c" }));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://backend.test:8000/v1/auth/logout");
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBe("Bearer a.b.c");
    expect(res.headers.get("set-cookie") ?? "").toMatch(/rs_session=;.*Max-Age=0/);
    spy.mockRestore();
    delete process.env.BACKEND_HOST;
  });

  it("still logs out when the backend has no logout endpoint yet or is down", async () => {
    process.env.BACKEND_HOST = "backend.test";
    vi.resetModules();
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const { DELETE: del } = await import("@/app/api/session/route");
    const res = await del(req("DELETE", undefined, { cookie: "rs_session=a.b.c" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/rs_session=;.*Max-Age=0/);
    spy.mockRestore();
    delete process.env.BACKEND_HOST;
  });

  it("skips the backend call when there is no session cookie", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await DELETE(req("DELETE"));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

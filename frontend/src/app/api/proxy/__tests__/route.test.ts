// @vitest-environment node
//
// Tests for the catch-all backend proxy at
// src/app/api/proxy/[...path]/route.ts.
//
// This handler talks to the FastAPI backend over raw node:http (not
// fetch), so it needs the real "node" vitest environment rather than
// the project-wide jsdom default — hence the per-file override above.
// The global environment in vitest.config.ts is left untouched.
//
// CLAUDE.md §10.11 documents the exact regression these tests guard
// against: FastAPI 307-redirects any backend path that's missing a
// trailing slash, and the proxy re-issues that redirected request
// itself. The debug header (`x-backend-env`) must be stamped on BOTH
// the normal-response branch and the redirect-follow branch — most calls (auth/countries,
// fetch-simulation-details, etc.) go through the redirect branch, so a
// regression there is easy to miss if you only test the "happy path"
// non-redirected case.
//
// Because BACKEND_HOST / BACKEND_PORT are read from process.env at
// MODULE LOAD time, every test that cares about a specific host/port
// combination sets the env vars and then dynamically re-imports the
// module after `vi.resetModules()`.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { NextRequest } from "next/server";

interface PlanItem {
  /** Status code the mock backend responds with. Default 200. */
  statusCode?: number;
  /** Response headers, e.g. { location: "/auth/countries/" } for a redirect. */
  headers?: Record<string, string | string[]>;
  /** Response body chunks (each pushed as a separate "data" event). */
  chunks?: string[];
  /** If set, the mock response stream emits an "error" event with this message instead of "data"/"end". */
  resError?: string;
  /** If set, the mock request itself emits an "error" event (e.g. connection refused) instead of ever calling back with a response. */
  reqError?: string;
}

// vi.mock factories are hoisted above imports, so the mutable mock
// state has to be created via vi.hoisted() to be visible inside the
// factory closure below.
const httpMock = vi.hoisted(() => {
  const plans: PlanItem[] = [];
  const calls: any[] = [];
  const writes: Buffer[][] = [];

  const request = vi.fn((options: any, callback: (res: any) => void) => {
    calls.push(options);
    const plan = plans.shift();
    if (!plan) {
      throw new Error(`No mock plan queued for http.request call #${calls.length}`);
    }

    const myWrites: Buffer[] = [];
    writes.push(myWrites);

    const req: any = new EventEmitter();
    req.write = vi.fn((chunk: Buffer) => {
      myWrites.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.end = vi.fn(() => {
      if (plan.reqError) {
        // Simulate a connection-level failure (e.g. ECONNREFUSED) —
        // the real http.ClientRequest never calls back with a
        // response in this case, it only emits "error".
        queueMicrotask(() => req.emit("error", new Error(plan.reqError)));
        return;
      }

      const res: any = new EventEmitter();
      res.statusCode = plan.statusCode ?? 200;
      res.headers = plan.headers ?? {};

      // Fire the response callback synchronously (mirrors real
      // Node closely enough: listeners attached inside the
      // callback are guaranteed to be registered before the data/
      // end/error events below, which are queued as a *later*
      // microtask).
      callback(res);

      queueMicrotask(() => {
        if (plan.resError) {
          res.emit("error", new Error(plan.resError));
          return;
        }
        for (const c of plan.chunks ?? []) res.emit("data", Buffer.from(c));
        res.emit("end");
      });
    });

    return req;
  });

  return { request, plans, calls, writes };
});

// The source imports `import http from "node:http"` — mock both
// specifiers since Node treats them as the same builtin but vitest's
// mock registry keys off the literal specifier string used at the
// import site.
vi.mock("node:http", () => ({ default: { request: httpMock.request } }));
vi.mock("http", () => ({ default: { request: httpMock.request } }));

beforeEach(() => {
  httpMock.plans.length = 0;
  httpMock.calls.length = 0;
  httpMock.writes.length = 0;
});

/** Re-imports the route module fresh, after setting BACKEND_HOST/PORT, since those constants are read once at module load. */
async function loadHandler(host: string, port = "8000", env?: string) {
  vi.resetModules();
  process.env.BACKEND_HOST = host;
  process.env.BACKEND_PORT = port;
  if (env === undefined) delete process.env.BACKEND_ENV;
  else process.env.BACKEND_ENV = env;
  return import("@/app/api/proxy/[...path]/route");
}

function makeRequest(
  pathSegments: string[],
  init: ConstructorParameters<typeof NextRequest>[1] & { search?: string } = {}
) {
  const { search = "", ...rest } = init;
  const url = `http://localhost/api/proxy/${pathSegments.join("/")}${search}`;
  return new NextRequest(url, rest);
}

function callHandler(mod: any, req: NextRequest, path: string[]) {
  const method = req.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  return mod[method](req, { params: Promise.resolve({ path }) });
}

// ─── 1. Normal 200 response + x-backend-env derivation ─────────────────

describe("normal (non-redirected) response", () => {
  it.each([
    ["dev", "dev"],
    ["prod", "prod"],
    [undefined, "custom"],
  ])(
    "stamps x-backend-env from BACKEND_ENV=%s (-> %s) and never exposes the host",
    async (envLabel, expectedEnv) => {
      const host = "10.0.0.1";
      const mod = await loadHandler(host, "8000", envLabel);
      httpMock.plans.push({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        chunks: ['{"ok":true}'],
      });

      const req = makeRequest(["auth", "countries"], { method: "GET" });
      const res = await callHandler(mod, req, ["auth", "countries"]);

      expect(res.status).toBe(200);
      expect(res.headers.get("x-backend-env")).toBe(expectedEnv);
      expect(res.headers.get("x-backend-host")).toBeNull();
      expect(await res.text()).toBe('{"ok":true}');
    }
  );

  it("forwards method, path (no trailing slash), and the request body to the backend", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");
    httpMock.plans.push({ statusCode: 200, chunks: ["{}"] });

    const body = JSON.stringify({ user_id: "abc-123" });
    const req = makeRequest(["diet-recommendation-working"], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await callHandler(mod, req, ["diet-recommendation-working"]);

    expect(httpMock.calls).toHaveLength(1);
    const opts = httpMock.calls[0];
    expect(opts.hostname).toBe("10.0.0.1");
    expect(opts.port).toBe(8000);
    expect(opts.method).toBe("POST");
    expect(opts.path).toBe("/diet-recommendation-working");
    expect(Buffer.concat(httpMock.writes[0]).toString()).toBe(body);
  });

  it("never appends a trailing slash to the backend path, with or without a querystring", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");

    httpMock.plans.push({ statusCode: 200, chunks: ["[]"] });
    const reqNoQuery = makeRequest(["admin", "users"], { method: "GET" });
    await callHandler(mod, reqNoQuery, ["admin", "users"]);
    expect(httpMock.calls[0].path).toBe("/admin/users");

    httpMock.plans.push({ statusCode: 200, chunks: ["[]"] });
    const reqWithQuery = makeRequest(["admin", "users"], {
      method: "GET",
      search: "?page=1&page_size=100",
    });
    await callHandler(mod, reqWithQuery, ["admin", "users"]);
    expect(httpMock.calls[1].path).toBe("/admin/users?page=1&page_size=100");
  });

  // The two diet endpoints carry ?lang= in the URL even though they are
  // POSTs: `lang` is a query parameter server-side, and a `lang` key in the
  // JSON body is ignored SILENTLY (the backend falls back to the account's
  // profile language and still returns 200). The backend also renders and
  // PERSISTS report_html in whichever language the request resolved to, so a
  // query string dropped here would freeze reports in the wrong language
  // with nothing anywhere reporting an error.
  it("forwards the querystring on a POST, alongside the body", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");
    httpMock.plans.push({ statusCode: 200, chunks: ["{}"] });

    const body = JSON.stringify({ user_id: "abc-123" });
    const req = makeRequest(["v1", "animal", "diet-recommendation"], {
      method: "POST",
      headers: { "content-type": "application/json" },
      search: "?lang=hi",
      body,
    });
    await callHandler(mod, req, ["v1", "animal", "diet-recommendation"]);

    expect(httpMock.calls[0].path).toBe("/v1/animal/diet-recommendation?lang=hi");
    expect(Buffer.concat(httpMock.writes[0]).toString()).toBe(body);
  });
});

// ─── 2. Hop-by-hop header stripping + host overwrite ────────────────────

describe("request header forwarding", () => {
  it("forwards only allowlisted request headers and overwrites host with BACKEND_HOST:BACKEND_PORT", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");
    httpMock.plans.push({ statusCode: 200, chunks: ["{}"] });

    const req = makeRequest(["auth", "countries"], {
      method: "GET",
      headers: {
        Connection: "keep-alive",
        "Keep-Alive": "timeout=5",
        "Transfer-Encoding": "chunked",
        "Content-Encoding": "gzip",
        TE: "trailers",
        Upgrade: "websocket",
        "Proxy-Authenticate": "Basic",
        "Proxy-Authorization": "Basic abc",
        Host: "evil.example.com",
        "X-Custom": "value",
        Cookie: "session=abc",
        Origin: "https://evil.example.com",
        "X-Forwarded-For": "1.2.3.4",
        Authorization: "Bearer jwt",
        "Accept-Language": "hi",
      },
    });
    await callHandler(mod, req, ["auth", "countries"]);

    const forwarded = httpMock.calls[0].headers;
    for (const h of [
      "connection",
      "keep-alive",
      "transfer-encoding",
      "content-encoding",
      "te",
      "upgrade",
      "proxy-authenticate",
      "proxy-authorization",
      "x-custom",
      "cookie",
      "origin",
      "x-forwarded-for",
    ]) {
      expect(forwarded[h]).toBeUndefined();
    }
    // host is stripped as hop-by-hop, then unconditionally re-set to
    // the backend's own host:port — never the original request's Host.
    expect(forwarded["host"]).toBe("10.0.0.1:8000");
    expect(forwarded["authorization"]).toBe("Bearer jwt");
    expect(forwarded["accept-language"]).toBe("hi");
  });

  it("rejects dot segments instead of forwarding them", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");
    const req = makeRequest(["v1", "x"], { method: "GET" });
    const res = await callHandler(mod, req, ["v1", "..", "docs"]);
    expect(res.status).toBe(400);
    expect(httpMock.calls).toHaveLength(0);
  });

  it("fails closed with a 500 when BACKEND_HOST is not configured", async () => {
    const mod = await loadHandler("", "8000");
    const req = makeRequest(["v1", "auth", "countries"], { method: "GET" });
    const res = await callHandler(mod, req, ["v1", "auth", "countries"]);
    expect(res.status).toBe(500);
    expect(httpMock.calls).toHaveLength(0);
  });
});

describe("response header forwarding", () => {
  it("passes only allowlisted backend headers through to the browser", async () => {
    const mod = await loadHandler("10.0.0.1", "8000", "dev");
    httpMock.plans.push({
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": 'attachment; filename="x.xlsx"',
        server: "uvicorn",
        "set-cookie": ["a=1", "b=2"],
      },
      chunks: ["{}"],
    });
    const req = makeRequest(["v1", "auth", "countries"], { method: "GET" });
    const res = await callHandler(mod, req, ["v1", "auth", "countries"]);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="x.xlsx"');
    expect(res.headers.get("server")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does not follow a 302 on POST and never leaks the backend Location", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");
    httpMock.plans.push({ statusCode: 302, headers: { location: "http://10.0.0.1:8000/x" } });
    const req = makeRequest(["v1", "x"], { method: "POST", body: "{}" });
    const res = await callHandler(mod, req, ["v1", "x"]);
    expect(httpMock.calls).toHaveLength(1);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBeNull();
  });
});

// ─── 3. §10.11 — redirect-follow branch must ALSO stamp debug headers ──

describe("307/308 redirect-follow (CLAUDE.md §10.11 regression guard)", () => {
  it("re-issues the request to the redirect target and stamps x-backend-env on the FINAL response", async () => {
    const mod = await loadHandler("10.0.0.1", "8000", "dev");

    // FastAPI's real-world behavior: a path missing its trailing
    // slash comes back as a 307 with `location` pointing at the
    // slash-terminated path.
    httpMock.plans.push({
      statusCode: 307,
      headers: { location: "/auth/countries/" },
    });
    httpMock.plans.push({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      chunks: ['{"countries":[]}'],
    });

    const req = makeRequest(["auth", "countries"], { method: "GET" });
    const res = await callHandler(mod, req, ["auth", "countries"]);

    // Re-issued exactly once, to the redirect target.
    expect(httpMock.calls).toHaveLength(2);
    expect(httpMock.calls[1].path).toBe("/auth/countries/");
    expect(httpMock.calls[1].hostname).toBe("10.0.0.1");
    expect(httpMock.calls[1].port).toBe(8000);

    // This is the exact assertion the landmine doc calls out: the
    // debug headers must be present on the redirect-follow response,
    // not just the (never-surfaced-to-the-browser) 307 itself.
    expect(res.status).toBe(200);
    expect(res.headers.get("x-backend-host")).toBeNull();
    expect(res.headers.get("x-backend-env")).toBe("dev");
    expect(await res.text()).toBe('{"countries":[]}');
  });

  it("derives the redirect target's path+query from an absolute Location URL", async () => {
    const mod = await loadHandler("10.0.0.2", "8000", "prod");

    httpMock.plans.push({
      statusCode: 308,
      headers: { location: "http://10.0.0.2:8000/fetch-simulation-details/?x=1" },
    });
    httpMock.plans.push({ statusCode: 200, chunks: ["{}"] });

    const req = makeRequest(["fetch-simulation-details"], { method: "POST", body: "{}" });
    const res = await callHandler(mod, req, ["fetch-simulation-details"]);

    expect(httpMock.calls[1].path).toBe("/fetch-simulation-details/?x=1");
    expect(res.headers.get("x-backend-env")).toBe("prod");
    // Redirect path is re-issued against the PINNED host, not the Location's.
    expect(httpMock.calls[1].hostname).toBe("10.0.0.2");
  });
});

// ─── 4. Error handling resolves with 502 instead of throwing/hanging ──

describe("error handling", () => {
  it("resolves 502 with a generic message when the initial connection fails (no upstream internals leaked)", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");
    httpMock.plans.push({ reqError: "ECONNREFUSED" });

    const req = makeRequest(["auth", "countries"], { method: "GET" });
    const res = await callHandler(mod, req, ["auth", "countries"]);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "Upstream request failed" });
  });

  it("resolves 502 with 'Response stream error' when the normal (non-redirect) response stream errors", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");
    httpMock.plans.push({ statusCode: 200, resError: "socket hang up" });

    const req = makeRequest(["auth", "countries"], { method: "GET" });
    const res = await callHandler(mod, req, ["auth", "countries"]);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "Response stream error" });
  });

  it("resolves 502 with 'Redirect proxy error' when the redirect-follow response stream errors", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");
    httpMock.plans.push({ statusCode: 307, headers: { location: "/auth/countries/" } });
    httpMock.plans.push({ statusCode: 200, resError: "socket hang up" });

    const req = makeRequest(["auth", "countries"], { method: "GET" });
    const res = await callHandler(mod, req, ["auth", "countries"]);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "Redirect proxy error" });
  });

  it("resolves 502 with 'Redirect request error' when the redirect-follow connection itself fails", async () => {
    const mod = await loadHandler("10.0.0.1", "8000");
    httpMock.plans.push({ statusCode: 307, headers: { location: "/auth/countries/" } });
    httpMock.plans.push({ reqError: "ECONNRESET" });

    const req = makeRequest(["auth", "countries"], { method: "GET" });
    const res = await callHandler(mod, req, ["auth", "countries"]);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "Redirect request error" });
  });
});

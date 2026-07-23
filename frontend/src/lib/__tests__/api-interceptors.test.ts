import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock the axios module BEFORE importing api.ts ─────────────────────────
// api.ts does `const api = axios.create({...})` at module scope, then wires
// interceptors onto that instance. To exercise the interceptor callbacks we
// need our own mock instance whose `.interceptors.request.use` /
// `.interceptors.response.use` calls we can capture and invoke directly.
const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}));

vi.mock("axios", () => ({
  default: { create: () => mockApi },
}));

import { setTokenProvider, setUnauthorizedHandler } from "@/lib/api";

// api.ts registers its interceptors exactly ONCE, at module-import time
// (`api.interceptors.request.use(...)`, and TWO `response.use(...)` calls).
// The global vitest.setup.ts afterEach runs `vi.restoreAllMocks()`, which
// clears `.mock.calls` history on every vi.fn() — including these. Since
// the registration itself never re-fires (the module is only imported
// once), we must capture the registered callbacks HERE, at module scope,
// before any test's afterEach has had a chance to run — not re-read
// `mock.calls` from inside each `it()`.
const requestFn = mockApi.interceptors.request.use.mock.calls[0][0];
const responseCalls = mockApi.interceptors.response.use.mock.calls;
// First response.use() registration is the pure logger (rethrows as-is);
// the second is the FastAPI detail-extraction + 401 handler we care about.
const extractorErrorFn = responseCalls[responseCalls.length - 1][1];

beforeEach(() => {
  setTokenProvider(() => null);
});

// ─── Request interceptor — Authorization header injection ──────────────────

describe("request interceptor — Authorization header", () => {
  it("attaches Bearer <token> when tokenProvider returns a token", () => {
    setTokenProvider(() => "jwt-123");
    const config = { headers: {} as Record<string, string> };
    const result = requestFn(config);
    expect(result.headers["Authorization"]).toBe("Bearer jwt-123");
  });

  it("does not attach Authorization when tokenProvider returns null", () => {
    setTokenProvider(() => null);
    const config = { headers: {} as Record<string, string> };
    const result = requestFn(config);
    expect(result.headers["Authorization"]).toBeUndefined();
  });

  it("initializes headers when config.headers is undefined", () => {
    setTokenProvider(() => "abc");
    const config = {} as { headers?: Record<string, string> };
    const result = requestFn(config);
    expect(result.headers?.["Authorization"]).toBe("Bearer abc");
  });
});

// ─── Response interceptor — FastAPI detail extraction + 401 handling ───────

describe("response interceptor — detail extraction", () => {
  it("extracts a plain string detail", async () => {
    await expect(
      extractorErrorFn({ response: { status: 400, data: { detail: "Bad request" } } })
    ).rejects.toThrow("Bad request");
  });

  it("joins an array of FastAPI validation errors by their msg field", async () => {
    await expect(
      extractorErrorFn({
        response: {
          status: 422,
          data: { detail: [{ msg: "field required" }, { msg: "too short" }] },
        },
      })
    ).rejects.toThrow("field required, too short");
  });

  it("stringifies array entries lacking a msg field", async () => {
    await expect(
      extractorErrorFn({ response: { status: 422, data: { detail: [{ loc: ["body", "x"] }] } } })
    ).rejects.toThrow(JSON.stringify({ loc: ["body", "x"] }));
  });

  it("falls back to response.data.message when detail is absent", async () => {
    await expect(
      extractorErrorFn({ response: { status: 500, data: { message: "server exploded" } } })
    ).rejects.toThrow("server exploded");
  });

  it("falls back to err.message when there is no response body at all", async () => {
    await expect(extractorErrorFn({ message: "network down" })).rejects.toThrow("network down");
  });

  it("falls back to a generic message as the last resort", async () => {
    await expect(extractorErrorFn({})).rejects.toThrow("An unexpected error occurred");
  });
});

describe("response interceptor — 401 unauthorized handling", () => {
  it("fires the registered unauthorized handler on a 401", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await expect(
      extractorErrorFn({ response: { status: 401, data: { detail: "Token expired" } } })
    ).rejects.toThrow("Token expired");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire the handler for non-401 statuses", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await expect(extractorErrorFn({ response: { status: 500, data: {} } })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

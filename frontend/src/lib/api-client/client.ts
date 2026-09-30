// The axios instance, its interceptors and the token / language / 401 providers.
// Split out of src/lib/api.ts (audit B-17); import from "@/lib/api".

import axios from "axios";
import { API_TIMEOUT_MS } from "../timeouts";

// ─── Axios Instance ───────────────────────────────────────────────────────────
//
// Testing-branch note (2026-06): the dev backend was migrated
// to RationSmart v4.0.0:
//   1. All endpoints now live under /v1/...
//   2. Authenticated endpoints require Authorization: Bearer <jwt> (HTTPBearer)
//   3. Many endpoints dropped the user_id query param — it's derived from
//      the JWT instead
//   4. Custom-feed update is now PUT (was POST) with feed_id as a query param
//   5. /fetch-* POST endpoints became GET equivalents
//   6. The prod backend is still on the legacy API — this file is
//      incompatible with it.
// `tokenProvider` is set from src/lib/store.ts so the interceptor can read
// the latest JWT on every request without a circular import.

export const api = axios.create({
  baseURL: "/api/proxy",
  timeout: API_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

let tokenProvider: () => string | null = () => null;
export const setTokenProvider = (fn: () => string | null) => {
  tokenProvider = fn;
};

// i18n V2: the store wires this to read user.preferred_language at call
// time, so every API helper can append ?lang= without reaching into the
// store. Falls back to "en" when no user is signed in.
let langProvider: () => string = () => "en";
export const setLangProvider = (fn: () => string) => {
  langProvider = fn;
};
// Helper for endpoint helpers to spread the current ?lang= into their params.
export const langParam = (): { lang: string } => ({ lang: langProvider() });

// Opt-in API tracing for diagnosing shape mismatches. OFF unless the build
// sets NEXT_PUBLIC_DEBUG_API=true, and even then it never prints tokens or
// the bodies of /auth/* calls (login responses carry the JWT and PII).
// Response bodies are always visible in the DevTools Network tab anyway.
const DEBUG_API = process.env.NEXT_PUBLIC_DEBUG_API === "true";
const isAuthPath = (url: string) => url.includes("/auth/");

api.interceptors.request.use((config) => {
  const token = tokenProvider();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  if (DEBUG_API && typeof window !== "undefined") {
    const method = (config.method || "GET").toUpperCase();
    console.debug(`[api →] ${method} ${config.url ?? ""}`, { params: config.params });
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (DEBUG_API && typeof window !== "undefined") {
      const method = (response.config.method || "GET").toUpperCase();
      const url = response.config.url ?? "";
      console.debug(
        `[api ←] ${response.status} ${method} ${url}`,
        isAuthPath(url) ? "(body hidden)" : response.data
      );
    }
    return response;
  },
  (err) => {
    if (typeof window !== "undefined") {
      const cfg = err?.config ?? {};
      const method = (cfg.method || "GET").toUpperCase();
      // SECURITY: log status + message only, never `err.response.data`. On a
      // production build console.error survives (removeConsole excludes it),
      // and the response body can carry PII / FastAPI `detail` strings. The
      // full body is still visible in the DevTools Network tab when needed.
      console.error(
        `[api ×] ${err?.response?.status ?? "ERR"} ${method} ${cfg.url ?? ""}`,
        err?.message
      );
    }
    return Promise.reject(err);
  }
);

// Auth-expired handler — the store registers a callback that clears
// state and redirects to /login. Wired via setUnauthorizedHandler()
// to avoid a circular import between api.ts and store.ts.
let unauthorizedHandler: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  unauthorizedHandler = fn;
};

// Response error interceptor — safely extract message from FastAPI errors.
// Also intercepts 401 (typically "Token expired") and kicks the user back
// to /login so they don't get stranded on a screen whose data will never
// load. Without this handler the user sees empty dropdowns forever and
// has no clue their session died.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail;

    // 401 → session invalid. Fire the handler once, then let the
    // rejected promise flow through so call sites can still their own
    // fallback UI if they want. Guard with a module-level flag so
    // multiple in-flight requests don't stack duplicate redirects.
    //
    // BUT: a 401 from a PUBLIC auth-flow endpoint (login, register, forgot/
    // set PIN, resend/verify) means the *submitted credentials* were rejected
    // — e.g. a wrong PIN on the login screen — NOT that an existing session
    // expired. Firing the session-expiry handler there would wrongly clear
    // and log out a user who is already signed in (an admin re-opening the
    // login form, say). Only treat 401s from authenticated endpoints as a
    // dead session.
    const reqUrl: string = error?.config?.url ?? "";
    const isPublicAuthFlow = /\/auth\/(login|register|forgot-pin|set-new-pin|resend|verify)/i.test(
      reqUrl
    );
    if (status === 401 && unauthorizedHandler && !isPublicAuthFlow) {
      unauthorizedHandler();
    }

    let message: string;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      // FastAPI validation errors: [{loc, msg, type}]
      message = detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join(", ");
    } else {
      message = error?.response?.data?.message ?? error?.message ?? "An unexpected error occurred";
    }
    // Keep the HTTP status on the error so screens can pick a safe message
    // (e.g. auth flows that must not reveal whether an account exists).
    const e = new Error(message) as Error & { status?: number; retryAfter?: number };
    e.status = status;
    // Rate limiting (audit A-20): the backend answers 429 with Retry-After,
    // in seconds or as an HTTP date. Kept on the error so screens can say
    // how long to wait.
    const retryAfter = parseRetryAfter(error?.response?.headers?.["retry-after"]);
    if (retryAfter !== undefined) e.retryAfter = retryAfter;
    return Promise.reject(e);
  }
);

/** Retry-After → whole seconds (≥ 1), or undefined when absent / unparseable. */
export function parseRetryAfter(raw: unknown, now = Date.now()): number | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const text = String(raw).trim();
  if (text === "") return undefined;
  if (/^\d+$/.test(text)) return Math.max(1, Number(text));
  const at = Date.parse(text);
  if (Number.isNaN(at)) return undefined;
  return Math.max(1, Math.ceil((at - now) / 1000));
}

export default api;

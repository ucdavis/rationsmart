import { type NextRequest, NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";
import { UPSTREAM_TIMEOUT_MS } from "@/lib/timeouts";
import {
  clearSessionCookie,
  isSameOriginRequest,
  readSessionToken,
  setSessionCookie,
} from "@/lib/session-cookie";
import { asRecord, stringField } from "@/lib/api-client/normalize";
import { BACKEND_HOST, BACKEND_PORT, BACKEND_PROTOCOL } from "@/lib/backend-origin";

// Backend location comes ONLY from the environment (see .env.example). There
// is deliberately no hardcoded IP fallback: a deploy with missing env vars
// fails closed with a 500 instead of silently talking to some other backend.
// Label surfaced as `x-backend-env` so DevTools shows which backend served a
// request (dev | prod | custom) without exposing the host itself.
const BACKEND_ENV = process.env.BACKEND_ENV ?? "custom";
// Upstream scheme: BACKEND_PROTOCOL in lib/backend-origin.ts (audit A-02).
const transport = BACKEND_PROTOCOL === "https" ? https : http;

// Upstream request timeout (UPSTREAM_TIMEOUT_MS, src/lib/timeouts.ts). Without
// it, a backend that accepts the connection but never responds keeps the
// serverless function (and its socket) alive until the platform's hard limit.
// Note it is an idle-socket timeout, not a total-duration cap; Vercel's
// function max duration bounds the total.

// Largest request body we'll buffer and forward (bulk-upload spreadsheets are
// the biggest payloads). Vercel caps function bodies at 4.5 MB anyway.
const MAX_BODY_BYTES = 5 * 1024 * 1024;
// Largest upstream response we buffer (exports are the biggest). Beyond this
// the proxy aborts with a 502 rather than holding an unbounded body in memory
// (audit A-16). Vercel also caps function responses at 4.5 MB.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

// Only these request headers reach the backend. Everything else — cookies,
// origin, x-forwarded-*, accept-encoding (we can't re-encode the response) —
// is dropped.
const FORWARD_REQUEST_HEADERS = new Set([
  "authorization",
  "content-type",
  "accept",
  "accept-language",
  "user-agent",
]);

// Only these backend response headers reach the browser. `server`,
// `set-cookie`, raw `location` etc. are dropped.
const FORWARD_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-disposition",
  "content-language",
  "cache-control",
  "etag",
  "last-modified",
  "retry-after",
]);

function buildResponse(
  res: http.IncomingMessage,
  body: ReturnType<typeof Buffer.concat>
): NextResponse {
  const headers = new Headers();
  for (const [k, v] of Object.entries(res.headers)) {
    if (v && FORWARD_RESPONSE_HEADERS.has(k.toLowerCase())) {
      headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
  }
  headers.set("x-backend-env", BACKEND_ENV);
  return new NextResponse(body, { status: res.statusCode ?? 200, headers });
}

/**
 * POST /v1/auth/login: move the JWT out of the JSON body into the httpOnly
 * session cookie (audit A-04). The body keeps `token_type` / `expires_in` so
 * the client still knows when the session ends, but never sees the token.
 */
function captureLoginToken(req: NextRequest, res: NextResponse, body: Buffer): NextResponse {
  if (res.status !== 200) return res;
  let json: Record<string, unknown> | null;
  try {
    json = asRecord(JSON.parse(body.toString("utf8")));
  } catch {
    return res;
  }
  if (!json) return res;
  const tok = json.token;
  const tokObj = asRecord(tok);
  const access = typeof tok === "string" ? tok : (stringField(tok, "access_token") ?? null);
  if (!access) return res;
  const expiresIn = tokObj?.expires_in;
  const { access_token: _dropped, ...rest } = tokObj ?? { access_token: access };
  const out = NextResponse.json(
    { ...json, token: { ...rest, in_cookie: true } },
    {
      status: res.status,
      headers: res.headers,
    }
  );
  setSessionCookie(req, out, access, typeof expiresIn === "number" ? expiresIn : undefined);
  return out;
}

/** Collects a response stream, aborting past MAX_RESPONSE_BYTES. */
function collect(
  res: http.IncomingMessage,
  onDone: (body: ReturnType<typeof Buffer.concat>) => void,
  onTooLarge: () => void
) {
  const chunks: Buffer[] = [];
  let size = 0;
  res.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_RESPONSE_BYTES) {
      res.destroy?.();
      onTooLarge();
      return;
    }
    chunks.push(chunk);
  });
  res.on("end", () => {
    if (size <= MAX_RESPONSE_BYTES) onDone(Buffer.concat(chunks));
  });
}

/** Should this upstream response be followed server-side (it never reaches the browser)? */
function isFollowableRedirect(status: number, method: string): boolean {
  if (status === 307 || status === 308) return true;
  // 301/302/303 change POST semantics, so only follow them for safe methods.
  return (
    (status === 301 || status === 302 || status === 303) && (method === "GET" || method === "HEAD")
  );
}

// Next 14 passes `params` as a plain object; Next 15 passes a Promise.
// Accept both so `await params` is correct either way.
type RouteContext = { params: { path: string[] } | Promise<{ path: string[] }> };

async function handler(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  if (!BACKEND_HOST) {
    console.error("[proxy] BACKEND_HOST is not set — refusing to proxy");
    return NextResponse.json({ detail: "Backend not configured" }, { status: 500 });
  }

  const { path } = await params;
  if (path.some((s) => s === "" || s === "." || s === "..")) {
    return NextResponse.json({ detail: "Invalid path" }, { status: 400 });
  }
  // Only the versioned API is proxied (every client call is under /v1/). This
  // keeps the backend's /docs, /redoc and /openapi.json — and anything else
  // at the root — unreachable through the public app domain (audit A-15).
  if (path[0] !== "v1") {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  const search = req.nextUrl.search; // includes leading "?"

  // Cookie-authenticated, state-changing calls must come from this app
  // (CSRF defence in depth; the cookie is also SameSite=Strict).
  const sessionToken = readSessionToken(req);
  if (sessionToken && req.method !== "GET" && req.method !== "HEAD" && !isSameOriginRequest(req)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }
  const isLogin = req.method === "POST" && path.join("/") === "v1/auth/login";

  // No trailing slash: all but one backend route is defined without it, and
  // FastAPI 307-redirects the slash-terminated form — which used to cost an
  // extra round trip (and a second POST body upload) on every call. The one
  // slash-defined route (get-all-reports) is still reached via the redirect
  // follow below.
  const backendPath = `/${path.map(encodeURIComponent).join("/")}${search}`;

  // Read body for non-GET requests
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ detail: "Request body too large" }, { status: 413 });
  }
  const bodyBuffer = hasBody ? Buffer.from(await req.arrayBuffer()) : null;
  if (bodyBuffer && bodyBuffer.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ detail: "Request body too large" }, { status: 413 });
  }

  const forwardHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (FORWARD_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders[key] = value;
    }
  });
  // The session cookie supplies the bearer token; an explicit Authorization
  // header (sessions from before the cookie existed) still wins.
  if (sessionToken && !forwardHeaders["authorization"] && !isLogin) {
    forwardHeaders["authorization"] = `Bearer ${sessionToken}`;
  }
  forwardHeaders["host"] = `${BACKEND_HOST}:${BACKEND_PORT}`;
  if (bodyBuffer) {
    forwardHeaders["content-length"] = String(bodyBuffer.byteLength);
  }

  return new Promise<NextResponse>((resolveOnce) => {
    // `timeout` below only fires on an idle socket. A backend that trickles
    // bytes forever would never trip it, so also cap the total duration.
    let settled = false;
    const inFlight: http.ClientRequest[] = [];
    const deadline = setTimeout(() => {
      inFlight.forEach((r) => r.destroy());
      resolve(NextResponse.json({ detail: "Upstream timeout" }, { status: 504 }));
    }, UPSTREAM_TIMEOUT_MS);
    const resolve = (res: NextResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolveOnce(res);
    };
    const tooLarge = () =>
      resolve(NextResponse.json({ detail: "Upstream response too large" }, { status: 502 }));
    // A 401 on a cookie session means the token died server-side: drop the
    // cookie so the next request doesn't keep presenting it.
    const finish = (upstream: http.IncomingMessage, body: ReturnType<typeof Buffer.concat>) => {
      let res = buildResponse(upstream, body);
      if (isLogin) res = captureLoginToken(req, res, body);
      else if (res.status === 401 && sessionToken) clearSessionCookie(req, res);
      resolve(res);
    };

    const options: http.RequestOptions = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: backendPath,
      method: req.method,
      headers: forwardHeaders,
      timeout: UPSTREAM_TIMEOUT_MS,
    };

    const proxyReq = transport.request(options, (proxyRes) => {
      const redirectStatus = proxyRes.statusCode ?? 200;
      const location = proxyRes.headers["location"];

      if (isFollowableRedirect(redirectStatus, req.method) && location) {
        // Re-issue to the same pinned host — only path+query are taken from
        // the Location header, so a redirect can never point us elsewhere.
        const target = new URL(location, `${BACKEND_PROTOCOL}://${BACKEND_HOST}:${BACKEND_PORT}`);
        const redirectOpts: http.RequestOptions = {
          hostname: BACKEND_HOST,
          port: BACKEND_PORT,
          path: target.pathname + target.search,
          method: req.method,
          headers: forwardHeaders,
          timeout: UPSTREAM_TIMEOUT_MS,
        };

        const redirectReq = transport.request(redirectOpts, (redirectRes) => {
          collect(redirectRes, (body) => finish(redirectRes, body), tooLarge);
          redirectRes.on("error", () =>
            resolve(NextResponse.json({ detail: "Redirect proxy error" }, { status: 502 }))
          );
        });

        inFlight.push(redirectReq);
        redirectReq.on("error", () =>
          resolve(NextResponse.json({ detail: "Redirect request error" }, { status: 502 }))
        );
        redirectReq.on("timeout", () => {
          redirectReq.destroy();
          resolve(NextResponse.json({ detail: "Upstream timeout" }, { status: 504 }));
        });

        if (bodyBuffer) redirectReq.write(bodyBuffer);
        redirectReq.end();
        // Drain the redirect response so its socket is released.
        proxyRes.resume?.();
        return;
      }

      // Normal response
      collect(proxyRes, (body) => finish(proxyRes, body), tooLarge);
      proxyRes.on("error", () =>
        resolve(NextResponse.json({ detail: "Response stream error" }, { status: 502 }))
      );
    });

    inFlight.push(proxyReq);
    proxyReq.on("error", (err) => {
      // Log the real cause server-side (Vercel function logs) but return a
      // generic message so upstream/connection internals aren't echoed to
      // the browser.
      console.error("[proxy] upstream request error:", err.message);
      resolve(NextResponse.json({ detail: "Upstream request failed" }, { status: 502 }));
    });
    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      resolve(NextResponse.json({ detail: "Upstream timeout" }, { status: 504 }));
    });

    if (bodyBuffer) proxyReq.write(bodyBuffer);
    proxyReq.end();
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;

import { type NextRequest, NextResponse } from "next/server";
// AUDIT A-02 (deferred): the upstream hop is plain HTTP because the backend
// only listens on http://<ip>:8000 — there is no TLS certificate or hostname
// in front of it yet. Switching to node:https is a one-line change here once
// the backend team puts a TLS terminator (ALB / reverse proxy) in front.
import http from "node:http";
import { UPSTREAM_TIMEOUT_MS } from "@/lib/timeouts";

// Backend location comes ONLY from the environment (see .env.example). There
// is deliberately no hardcoded IP fallback: a deploy with missing env vars
// fails closed with a 500 instead of silently talking to some other backend.
const BACKEND_HOST = process.env.BACKEND_HOST ?? "";
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT ?? "8000", 10);
// Label surfaced as `x-backend-env` so DevTools shows which backend served a
// request (dev | prod | custom) without exposing the host itself.
const BACKEND_ENV = process.env.BACKEND_ENV ?? "custom";

// Upstream request timeout (UPSTREAM_TIMEOUT_MS, src/lib/timeouts.ts). Without
// it, a backend that accepts the connection but never responds keeps the
// serverless function (and its socket) alive until the platform's hard limit.
// Note it is an idle-socket timeout, not a total-duration cap; Vercel's
// function max duration bounds the total.

// Largest request body we'll buffer and forward (bulk-upload spreadsheets are
// the biggest payloads). Vercel caps function bodies at 4.5 MB anyway.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

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

/** Should this upstream response be followed server-side (it never reaches the browser)? */
function isFollowableRedirect(status: number, method: string): boolean {
  if (status === 307 || status === 308) return true;
  // 301/302/303 change POST semantics, so only follow them for safe methods.
  return (
    (status === 301 || status === 302 || status === 303) && (method === "GET" || method === "HEAD")
  );
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  if (!BACKEND_HOST) {
    console.error("[proxy] BACKEND_HOST is not set — refusing to proxy");
    return NextResponse.json({ detail: "Backend not configured" }, { status: 500 });
  }

  const { path } = await params;
  if (path.some((s) => s === "" || s === "." || s === "..")) {
    return NextResponse.json({ detail: "Invalid path" }, { status: 400 });
  }
  const search = req.nextUrl.search; // includes leading "?"

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
  forwardHeaders["host"] = `${BACKEND_HOST}:${BACKEND_PORT}`;
  if (bodyBuffer) {
    forwardHeaders["content-length"] = String(bodyBuffer.byteLength);
  }

  return new Promise<NextResponse>((resolve) => {
    const options: http.RequestOptions = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: backendPath,
      method: req.method,
      headers: forwardHeaders,
      timeout: UPSTREAM_TIMEOUT_MS,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const redirectStatus = proxyRes.statusCode ?? 200;
      const location = proxyRes.headers["location"];

      if (isFollowableRedirect(redirectStatus, req.method) && location) {
        // Re-issue to the same pinned host — only path+query are taken from
        // the Location header, so a redirect can never point us elsewhere.
        const target = new URL(location, `http://${BACKEND_HOST}:${BACKEND_PORT}`);
        const redirectOpts: http.RequestOptions = {
          hostname: BACKEND_HOST,
          port: BACKEND_PORT,
          path: target.pathname + target.search,
          method: req.method,
          headers: forwardHeaders,
          timeout: UPSTREAM_TIMEOUT_MS,
        };

        const redirectReq = http.request(redirectOpts, (redirectRes) => {
          const chunks: Buffer[] = [];
          redirectRes.on("data", (chunk: Buffer) => chunks.push(chunk));
          redirectRes.on("end", () => resolve(buildResponse(redirectRes, Buffer.concat(chunks))));
          redirectRes.on("error", () =>
            resolve(NextResponse.json({ detail: "Redirect proxy error" }, { status: 502 }))
          );
        });

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
      const chunks: Buffer[] = [];
      proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on("end", () => resolve(buildResponse(proxyRes, Buffer.concat(chunks))));
      proxyRes.on("error", () =>
        resolve(NextResponse.json({ detail: "Response stream error" }, { status: 502 }))
      );
    });

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

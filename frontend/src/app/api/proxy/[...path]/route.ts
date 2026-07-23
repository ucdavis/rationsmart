import { type NextRequest, NextResponse } from "next/server";
import http from "node:http";

const BACKEND_HOST = process.env.BACKEND_HOST ?? "<DEV_BACKEND_IP>";
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT ?? "8000", 10);

// Upstream request timeout. Without this, a backend that accepts the
// connection but never responds keeps the serverless function (and its
// socket) alive until the platform's hard limit — a resource-exhaustion
// vector. Kept just above the axios client's 60-s timeout so the browser
// gives up first under normal conditions.
const UPSTREAM_TIMEOUT_MS = 65_000;

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
]);

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const segments = path.join("/");
  const search = req.nextUrl.search; // includes leading "?"

  // Always append trailing slash — FastAPI routes are defined with it
  const backendPath = `/${segments}/${search}`;

  // Read body for non-GET requests
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const bodyBuffer = hasBody ? Buffer.from(await req.arrayBuffer()) : null;

  // Build forwarded headers
  const forwardHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
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
      // Follow 307/308 redirects server-side
      const redirectStatus = proxyRes.statusCode ?? 200;
      const location = proxyRes.headers["location"];

      if ((redirectStatus === 307 || redirectStatus === 308) && location) {
        // Re-issue the request to the redirect URL (strip host, keep path+query)
        const redirectPath = location.startsWith("http")
          ? new URL(location).pathname + (new URL(location).search || "")
          : location;

        const redirectOpts: http.RequestOptions = {
          hostname: BACKEND_HOST,
          port: BACKEND_PORT,
          path: redirectPath,
          method: req.method,
          headers: forwardHeaders,
          timeout: UPSTREAM_TIMEOUT_MS,
        };

        const redirectReq = http.request(redirectOpts, (redirectRes) => {
          const chunks: Buffer[] = [];
          redirectRes.on("data", (chunk: Buffer) => chunks.push(chunk));
          redirectRes.on("end", () => {
            const body = Buffer.concat(chunks);
            const resHeaders = new Headers();
            Object.entries(redirectRes.headers).forEach(([k, v]) => {
              if (v && !HOP_BY_HOP.has(k.toLowerCase())) {
                resHeaders.set(k, Array.isArray(v) ? v.join(", ") : v);
              }
            });
            // Same debug headers as the normal-response branch — FastAPI
            // 307-redirects any path without a trailing slash, and that
            // re-issue lands here, so without setting the headers here
            // most calls (auth/countries, fetch-simulation-details, etc.)
            // never expose the upstream host to the browser.
            const env = BACKEND_HOST === "<PROD_BACKEND_IP>" ? "prod" : BACKEND_HOST === "<DEV_BACKEND_IP>" ? "dev" : "custom";
            resHeaders.set("x-backend-host", `${BACKEND_HOST}:${BACKEND_PORT}`);
            resHeaders.set("x-backend-env", env);
            resolve(
              new NextResponse(body, {
                status: redirectRes.statusCode ?? 200,
                headers: resHeaders,
              })
            );
          });
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
        return;
      }

      // Normal response
      const chunks: Buffer[] = [];
      proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const body = Buffer.concat(chunks);
        const resHeaders = new Headers();
        Object.entries(proxyRes.headers).forEach(([k, v]) => {
          if (v && !HOP_BY_HOP.has(k.toLowerCase())) {
            resHeaders.set(k, Array.isArray(v) ? v.join(", ") : v);
          }
        });
        // Surface the upstream backend so the user can see in Chrome
        // DevTools (Network → Response Headers) which host actually
        // served the request — "dev" (<DEV_BACKEND_IP>) or "prod"
        // (<PROD_BACKEND_IP>). Helps debug dev/prod data mismatches without
        // dropping to the terminal.
        const env = BACKEND_HOST === "<PROD_BACKEND_IP>" ? "prod" : BACKEND_HOST === "<DEV_BACKEND_IP>" ? "dev" : "custom";
        resHeaders.set("x-backend-host", `${BACKEND_HOST}:${BACKEND_PORT}`);
        resHeaders.set("x-backend-env", env);
        resolve(
          new NextResponse(body, {
            status: proxyRes.statusCode ?? 200,
            headers: resHeaders,
          })
        );
      });
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

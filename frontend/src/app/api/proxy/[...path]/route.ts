import { type NextRequest, NextResponse } from "next/server";
import http from "node:http";

// Env-only (no hardcoded fallback): the Vercel project must set BACKEND_HOST.
const BACKEND_HOST = process.env.BACKEND_HOST ?? "";
// Debug label for x-backend-env ("dev" / "prod"), set per Vercel project.
const BACKEND_ENV = process.env.BACKEND_ENV ?? "custom";
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT ?? "8000", 10);

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
            const env = BACKEND_ENV;
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
        // served the request — "dev" or "prod" (from BACKEND_ENV).
        // Helps debug dev/prod data mismatches without
        // dropping to the terminal.
        const env = BACKEND_ENV;
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

    proxyReq.on("error", (err) =>
      resolve(
        NextResponse.json(
          { detail: "Proxy error: " + err.message },
          { status: 502 }
        )
      )
    );

    if (bodyBuffer) proxyReq.write(bodyBuffer);
    proxyReq.end();
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;

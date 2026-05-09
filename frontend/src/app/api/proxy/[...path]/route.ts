import { type NextRequest, NextResponse } from "next/server";
import http from "node:http";

const BACKEND_HOST = "<DEV_BACKEND_IP>";
const BACKEND_PORT = 8000;

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

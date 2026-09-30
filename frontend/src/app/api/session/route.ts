import { type NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  isSameOriginRequest,
  readSessionToken,
  setSessionCookie,
} from "@/lib/session-cookie";
import { backendOrigin } from "@/lib/backend-origin";

// How long logout waits for the backend to revoke the token before giving up.
const REVOKE_TIMEOUT_MS = 3000;

// POST { token, expires_in? } — one-time migration for sessions created before
// the cookie existed: the token that older builds kept in localStorage is
// moved into the httpOnly cookie, and the client then forgets it (audit A-04).
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }
  let token: unknown;
  let expiresIn: unknown;
  try {
    ({ token, expires_in: expiresIn } = await req.json());
  } catch {
    return NextResponse.json({ detail: "Invalid body" }, { status: 400 });
  }
  if (typeof token !== "string" || token.split(".").length !== 3 || token.length > 4096) {
    return NextResponse.json({ detail: "Invalid token" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  setSessionCookie(req, res, token, typeof expiresIn === "number" ? expiresIn : undefined);
  return res;
}

// Ask the backend to revoke the token (audit A-14: POST /v1/auth/logout puts
// its jti on a deny-list). Best-effort: until the backend ships the endpoint
// this gets a 404, and a slow or unreachable backend is cut off after
// REVOKE_TIMEOUT_MS — logging out locally must never wait on it or fail.
async function revokeUpstream(token: string): Promise<void> {
  const origin = backendOrigin();
  if (!origin) return;
  try {
    await fetch(`${origin}/v1/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
  } catch {
    // Network error or timeout — the cookie is cleared regardless.
  }
}

// DELETE — logout / session expiry: revoke upstream, then drop the cookie.
export async function DELETE(req: NextRequest) {
  const token = readSessionToken(req);
  if (token) await revokeUpstream(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(req, res);
  return res;
}

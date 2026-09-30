import { type NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, isSameOriginRequest, setSessionCookie } from "@/lib/session-cookie";

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

// DELETE — logout / session expiry: drop the cookie.
export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(req, res);
  return res;
}

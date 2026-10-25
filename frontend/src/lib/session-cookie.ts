// Server-only helpers for the httpOnly session cookie (audit A-04).
//
// The JWT from POST /v1/auth/login never reaches browser JavaScript: the
// proxy moves it into this cookie (HttpOnly — unreadable by scripts, so an
// XSS can't steal it; SameSite=Strict — never sent on cross-site requests;
// Secure on https) and attaches `Authorization: Bearer …` itself on every
// upstream call. Scoped to /api so only the proxy + session routes see it.
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "rs_session";
/** Used when the backend doesn't say how long the token lives. */
const DEFAULT_MAX_AGE_S = 24 * 60 * 60;

export function readSessionToken(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value || null;
}

export function setSessionCookie(
  req: NextRequest,
  res: NextResponse,
  token: string,
  maxAgeSeconds?: number
): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: req.nextUrl.protocol === "https:",
    path: "/api",
    maxAge: maxAgeSeconds && maxAgeSeconds > 0 ? maxAgeSeconds : DEFAULT_MAX_AGE_S,
  });
}

export function clearSessionCookie(req: NextRequest, res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: req.nextUrl.protocol === "https:",
    path: "/api",
    maxAge: 0,
  });
}

/**
 * CSRF guard for cookie-authenticated, state-changing requests: the browser
 * always sends Origin on cross-origin POST/PUT/PATCH/DELETE, so require it to
 * be this app's own origin. (SameSite=Strict already keeps the cookie off
 * cross-site requests; this is defence in depth.)
 */
export function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from some browsers omit it
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

// Guards every backend-supplied URL (report PDFs, export files) before it is
// opened or assigned to an <a href>. A URL that isn't http(s) — e.g.
// `javascript:` or `data:` — is rejected, which closes the XSS path where a
// compromised or buggy backend response is executed in the app's origin.
//
// http: is still accepted alongside https: because the report bucket URLs
// the backend returns have not all been confirmed to be https; tighten this
// to https-only once they are.

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

/** Parses `raw` (absolute, or relative to this origin) and returns it only if it is http(s). */
export function safeExternalUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(raw.trim(), base);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** True when `url` has exactly this page's origin (not a prefix match). */
export function isSameOrigin(url: URL): boolean {
  return typeof window !== "undefined" && url.origin === window.location.origin;
}

/** Opens a vetted URL in a new tab. Returns false (and opens nothing) when the URL is unsafe. */
export function openExternalUrl(raw: unknown): boolean {
  const url = safeExternalUrl(raw);
  if (!url) return false;
  window.open(url.href, "_blank", "noopener,noreferrer");
  return true;
}

// Guards every backend-supplied URL (report PDFs, export files) before it is
// opened or assigned to an <a href>. A URL that isn't http(s) — e.g.
// `javascript:` or `data:` — is rejected, which closes the XSS path where a
// compromised or buggy backend response is executed in the app's origin.
//
// Only https: is opened (audit A-07). Two exceptions keep things working:
//  - same-origin links (e.g. a blob/relative path on http://localhost in dev);
//  - http:// Amazon S3 links, which are upgraded to https:// — S3 serves every
//    object over TLS, so the upgrade never breaks a report or export link.
// Anything else (javascript:, data:, plain-http third-party hosts) is refused.

/** Parses `raw` (absolute, or relative to this origin) and returns it only if it is safe to open (see above). */
export function safeExternalUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(raw.trim(), base);
    if (url.origin === base) return url;
    if (url.protocol === "https:") return url;
    if (url.protocol === "http:" && /(^|\.)amazonaws\.com$/i.test(url.hostname)) {
      url.protocol = "https:";
      return url;
    }
    return null;
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

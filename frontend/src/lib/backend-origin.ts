// Where the backend lives — read ONLY from the environment (see .env.example).
// Shared by the API proxy and the session route. There is deliberately no
// hardcoded fallback host: a deploy with missing env vars fails closed.

export const BACKEND_HOST = process.env.BACKEND_HOST ?? "";
export const BACKEND_PORT = parseInt(process.env.BACKEND_PORT ?? "8000", 10);
// Upstream scheme (audit A-02). Plain HTTP until TLS is in front of the
// backend; then set BACKEND_PROTOCOL=https — no code change needed.
export const BACKEND_PROTOCOL: "http" | "https" =
  process.env.BACKEND_PROTOCOL === "https" ? "https" : "http";

/** e.g. "https://api.example.org:443", or null when BACKEND_HOST is unset. */
export function backendOrigin(): string | null {
  return BACKEND_HOST ? `${BACKEND_PROTOCOL}://${BACKEND_HOST}:${BACKEND_PORT}` : null;
}

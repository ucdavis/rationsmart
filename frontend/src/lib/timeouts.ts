// Request timeouts shared by the browser client (api.ts) and the server-side
// proxy (app/api/proxy). They depend on each other: the proxy must outlast
// the client so the browser gives up first and sees its own timeout error
// instead of a truncated upstream 504.

/** axios timeout — Android uses 60 s connect/read/write timeouts. */
export const API_TIMEOUT_MS = 60_000;

/** Proxy → backend timeout, kept just above the client's. */
export const UPSTREAM_TIMEOUT_MS = API_TIMEOUT_MS + 5_000;

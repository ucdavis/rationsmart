// Shared error → user-message mapping for the auth-flow screens (Android
// parity: backend `detail` first, then a connectivity hint, then a
// screen-specific fallback). `translate` is the screen's useT() function.

export const NETWORK_ERROR_MESSAGE = "Please make sure your device has internet connectivity.";

export function authErrorMessage(
  err: unknown,
  fallback: string,
  translate: (source: string) => string = (s) => s
): string {
  if (err instanceof Error && err.message === "Network Error") {
    return translate(NETWORK_ERROR_MESSAGE);
  }
  if (err instanceof Error && err.message) return err.message;
  return translate(fallback);
}

/** HTTP status attached by the api client's error interceptor, if any. */
export function errorStatus(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

// Account-enumeration-safe wording (audit A-19). The backend answers an
// unknown email differently from a wrong PIN / a known email, so echoing its
// `detail` tells anyone whether an address has an account.
export const LOGIN_FAILED_MESSAGE = "Email or PIN is incorrect.";
export const RESET_SENT_NEUTRAL_MESSAGE =
  "If an account exists for this email, a PIN reset link has been sent.";

/** Login failure message: generic for 401/404, otherwise authErrorMessage. */
export function loginErrorMessage(
  err: unknown,
  fallback: string,
  translate: (source: string) => string = (s) => s
): string {
  const status = errorStatus(err);
  if (status === 401 || status === 404) return translate(LOGIN_FAILED_MESSAGE);
  return authErrorMessage(err, fallback, translate);
}

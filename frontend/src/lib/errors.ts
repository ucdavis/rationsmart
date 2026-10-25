// Shared error → user-message mapping for the auth-flow screens (Android
// parity: backend `detail` first, then a connectivity hint, then a
// screen-specific fallback). `translate` is the screen's useT() function.

import { numberField } from "@/lib/api-client/normalize";

export const NETWORK_ERROR_MESSAGE = "Please make sure your device has internet connectivity.";

// Rate limiting / lockout (audit A-20). Shown instead of the backend's
// detail so the wording is consistent and translated.
export const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts — try again in ${seconds} s.";
export const TOO_MANY_ATTEMPTS_NO_WAIT_MESSAGE =
  "Too many attempts — please wait a moment and try again.";
export const ACCOUNT_LOCKED_MESSAGE =
  "This account is temporarily locked. Try again later or reset your PIN.";

/** Seconds to wait from the error's Retry-After, if the backend sent one. */
export function retryAfterSeconds(err: unknown): number | undefined {
  return numberField(err, "retryAfter");
}

export function authErrorMessage(
  err: unknown,
  fallback: string,
  translate: (source: string) => string = (s) => s
): string {
  const status = errorStatus(err);
  if (status === 429) {
    const wait = retryAfterSeconds(err);
    return wait !== undefined
      ? translate(TOO_MANY_ATTEMPTS_MESSAGE).replace("${seconds}", String(wait))
      : translate(TOO_MANY_ATTEMPTS_NO_WAIT_MESSAGE);
  }
  if (status === 423) return translate(ACCOUNT_LOCKED_MESSAGE);
  if (err instanceof Error && err.message === "Network Error") {
    return translate(NETWORK_ERROR_MESSAGE);
  }
  if (err instanceof Error && err.message) return err.message;
  return translate(fallback);
}

/** HTTP status attached by the api client's error interceptor, if any. */
export function errorStatus(err: unknown): number | undefined {
  return numberField(err, "status");
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
export const RESEND_SENT_NEUTRAL_MESSAGE =
  "If that email is registered and not yet verified, a new link has been sent.";

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

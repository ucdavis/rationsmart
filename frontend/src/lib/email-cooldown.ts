// Client-side cooldown for actions that send an email (forgot-PIN, resend
// verification) — audit A-20. It stops accidental repeat taps and casual
// abuse from the UI; real rate limiting must still happen server-side.

export const EMAIL_ACTION_COOLDOWN_MS = 60_000;

const lastSent = new Map<string, number>();
const keyOf = (kind: string, email: string) => `${kind}:${email.trim().toLowerCase()}`;

/** Whole seconds left before `kind` may be sent to `email` again (0 = allowed). */
export function cooldownSecondsLeft(kind: string, email: string, now = Date.now()): number {
  const at = lastSent.get(keyOf(kind, email));
  if (at === undefined) return 0;
  return Math.max(0, Math.ceil((at + EMAIL_ACTION_COOLDOWN_MS - now) / 1000));
}

/** Record a successful send. */
export function markEmailSent(kind: string, email: string, now = Date.now()): void {
  lastSent.set(keyOf(kind, email), now);
}

/** Test hook: forget all cooldowns. */
export function resetEmailCooldowns(): void {
  lastSent.clear();
}

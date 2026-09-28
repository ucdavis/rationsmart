"use client";

import { useState } from "react";
import { resetPin } from "@/lib/api";
import { authErrorMessage, errorStatus, RESET_SENT_NEUTRAL_MESSAGE } from "@/lib/errors";
import { useStore } from "@/lib/store";
import { cooldownSecondsLeft, markEmailSent } from "@/lib/email-cooldown";

/**
 * The forgot-PIN request shared by /login (bottom sheet), /forgot-pin (page)
 * and /profile (Reset PIN sheet) — audit B-21. Each screen keeps its own UI;
 * this owns the request, the in-flight flag and the snackbars.
 *
 * - `fallbackError`: message when the backend gives no `detail` (translated).
 * - `defaultSuccess`: shown when the backend omits `message` (omit = none).
 * - `onSuccess`: screen-specific follow-up (close sheet, show "sent" state).
 */
export function useResetPin(opts: {
  translate: (s: string) => string;
  fallbackError: string;
  defaultSuccess?: string;
  onSuccess?: () => void;
}) {
  const [isSending, setIsSending] = useState(false);

  const send = async (email: string) => {
    if (isSending) return;
    const { showSnackbar } = useStore.getState();
    const wait = cooldownSecondsLeft("reset-pin", email);
    if (wait > 0) {
      showSnackbar(
        opts
          .translate("Please wait ${seconds} s before requesting another email.")
          .replace("${seconds}", String(wait)),
        "info"
      );
      return;
    }
    setIsSending(true);
    try {
      const res = await resetPin(email.trim());
      markEmailSent("reset-pin", email);
      // Android shows the backend's message via uiData.data.message.
      const msg =
        (res.data as { message?: string })?.message ??
        (opts.defaultSuccess ? opts.translate(opts.defaultSuccess) : undefined);
      if (msg) showSnackbar(msg, "success");
      opts.onSuccess?.();
    } catch (err: unknown) {
      // 404 = "email not found". Answer exactly like a successful send so
      // the screen can't be used to probe which emails have accounts
      // (audit A-19).
      if (errorStatus(err) === 404) {
        markEmailSent("reset-pin", email);
        showSnackbar(opts.translate(RESET_SENT_NEUTRAL_MESSAGE), "success");
        opts.onSuccess?.();
        return;
      }
      showSnackbar(authErrorMessage(err, opts.fallbackError, opts.translate), "error");
    } finally {
      setIsSending(false);
    }
  };

  return { isSending, send };
}

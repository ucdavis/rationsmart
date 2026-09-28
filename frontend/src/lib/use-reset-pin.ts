"use client";

import { useState } from "react";
import { resetPin } from "@/lib/api";
import { authErrorMessage } from "@/lib/errors";
import { useStore } from "@/lib/store";

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
    setIsSending(true);
    const { showSnackbar } = useStore.getState();
    try {
      const res = await resetPin(email.trim());
      // Android shows the backend's message via uiData.data.message.
      const msg =
        (res.data as { message?: string })?.message ??
        (opts.defaultSuccess ? opts.translate(opts.defaultSuccess) : undefined);
      if (msg) showSnackbar(msg, "success");
      opts.onSuccess?.();
    } catch (err: unknown) {
      showSnackbar(authErrorMessage(err, opts.fallbackError, opts.translate), "error");
    } finally {
      setIsSending(false);
    }
  };

  return { isSending, send };
}

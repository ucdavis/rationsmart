"use client";

import { useState } from "react";
import { saveReport } from "@/lib/api";
import { safeExternalUrl } from "@/lib/safe-url";
import { useStore } from "@/lib/store";

interface SaveReportResponse {
  success?: boolean;
  message?: string;
  bucket_url?: string | null;
  error_message?: string | null;
  report?: { bucket_url?: string | null };
  pdf_url?: string | null;
}

/**
 * "Save Report" for the diet report screen: POST /v1/animal/save-report,
 * then expose the PDF link (vetted by safeExternalUrl — it feeds window.open
 * and navigator.share). Split out of report/page.tsx (audit B-17).
 */
export function useSaveReport(translate: (s: string) => string) {
  const [isSaving, setIsSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const save = async (reportId: string) => {
    const { user, showSnackbar } = useStore.getState();
    if (!user || !reportId) {
      showSnackbar(translate("Report not ready — generate a report first"), "info");
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveReport(reportId, user.id);
      const body = res.data as SaveReportResponse;
      // Per the v1 swagger (SaveReportResponse), `success` and
      // `error_message` are independent: a save can succeed while
      // error_message describes a secondary problem. Only `success === false`
      // is a real save failure.
      if (body?.success === false) {
        showSnackbar(
          body?.error_message ?? body?.message ?? translate("Save returned an error"),
          "error"
        );
        return;
      }
      const url =
        safeExternalUrl(body?.bucket_url ?? body?.report?.bucket_url ?? body?.pdf_url)?.href ??
        null;
      setPdfUrl(url);
      if (!url) {
        // Surface exactly what the backend said about the missing PDF rather
        // than guessing a reason.
        showSnackbar(body?.error_message ?? body?.message ?? translate("Report saved"), "info");
      } else {
        showSnackbar(body?.message ?? translate("Report saved successfully!"), "success");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : translate("Failed to save report");
      showSnackbar(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, pdfUrl, save };
}

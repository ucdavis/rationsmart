"use client";

import { useState } from "react";
import { requestReportPdf } from "@/lib/api";
import { errorStatus } from "@/lib/errors";
import { openExternalUrl, safeExternalUrl } from "@/lib/safe-url";
import { useStore } from "@/lib/store";

/**
 * "Get PDF" for a saved report whose bucket_url is still null (W5): the PDF
 * is rendered in the background after save-report, and a failed job used to
 * leave it "PDF Pending" forever. POST /v1/animal/reports/pdf returns the
 * PDF, rendering it now if needed.
 *
 * `getPdf` resolves to the vetted URL (or null) and opens it. `failedIds`
 * holds reports whose last try got a 502, so the button can say "Try again".
 */
export function useReportPdf(translate: (s: string) => string) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const update = (setter: typeof setLoadingIds, id: string, on: boolean) =>
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const getPdf = async (reportId: string): Promise<string | null> => {
    const { user, showSnackbar } = useStore.getState();
    if (!user || !reportId) return null;
    update(setLoadingIds, reportId, true);
    try {
      const res = await requestReportPdf(reportId, user.id);
      const url = safeExternalUrl(res.data?.bucket_url)?.href ?? null;
      update(setFailedIds, reportId, false);
      if (!url) {
        showSnackbar(translate("The PDF isn't ready yet. Please try again."), "info");
        return null;
      }
      // The PDF arrives after a network round trip, so a popup blocker may
      // stop the new tab; the caller also shows a View Report button then.
      openExternalUrl(url);
      return url;
    } catch (err: unknown) {
      const status = errorStatus(err);
      if (status === 502) {
        update(setFailedIds, reportId, true);
        showSnackbar(translate("Could not create the PDF. Please try again."), "error");
      } else if (status === 409) {
        showSnackbar(translate("This report hasn't been saved yet, or has no content."), "error");
      } else if (status === 404) {
        showSnackbar(translate("Report not found."), "error");
      } else {
        showSnackbar(translate("Could not get the PDF. Please try again."), "error");
      }
      return null;
    } finally {
      update(setLoadingIds, reportId, false);
    }
  };

  return { getPdf, loadingIds, failedIds };
}

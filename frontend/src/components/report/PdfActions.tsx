"use client";

// View PDF + Share Report, shown once a saved report has its PDF. Used by the
// diet report and the calf milk plan; split out of report/page.tsx (W13).

import { useStore } from "@/lib/store";
import { COLORS } from "@/lib/colors";
import { IcViewPdf, IcShareReport } from "@/components/Icons";

export default function PdfActions({
  pdfUrl,
  shareText,
  t,
}: {
  /** Already vetted by safeExternalUrl. */
  pdfUrl: string;
  shareText: string;
  t: (source: string) => string;
}) {
  const share = async () => {
    const { showSnackbar } = useStore.getState();
    const shareData = { title: t("RationSmart Diet Report"), text: shareText, url: pdfUrl };
    try {
      // Web Share API on mobile pops the native sheet (WhatsApp / Telegram /
      // etc.), matching the Android "Share the report" function in the test
      // matrix. Falls back to copy-to-clipboard on desktop browsers without
      // navigator.share.
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(pdfUrl);
        showSnackbar(t("PDF link copied to clipboard"), "success");
      } else {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      // navigator.share rejects with AbortError if the user dismisses the
      // sheet — that's not a real failure.
      if (err instanceof Error && err.name !== "AbortError") {
        showSnackbar(t("Could not share the report"), "error");
      }
    }
  };

  return (
    <div className="flex gap-3 mb-3">
      <button
        onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
        className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
        style={{
          backgroundColor: COLORS.honeydew,
          color: COLORS.darkAquamarineGreen,
          border: `1px solid ${COLORS.darkAquamarineGreen}`,
          cursor: "pointer",
        }}
      >
        <IcViewPdf />
        {t("View PDF")}
      </button>
      <button
        onClick={() => void share()}
        className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
        style={{
          backgroundColor: COLORS.darkAquamarineGreen,
          color: COLORS.white,
          border: "none",
          cursor: "pointer",
        }}
      >
        <IcShareReport />
        {t("Share Report")}
      </button>
    </div>
  );
}

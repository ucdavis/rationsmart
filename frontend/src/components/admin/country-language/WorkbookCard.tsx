"use client";

// Local Feed Names — the bulk workbook card: export all names, import an
// edited workbook, show the import summary. Split out of FeedNamesTab.tsx
// (audit B-17); the tab owns the state.

import type { Dispatch, SetStateAction } from "react";
import { uploadFileProblem } from "@/lib/download";
import { COLORS } from "@/lib/colors";
import { CountryRow, UploadSummary, cardStyle } from "./shared";
import { fillText } from "@/lib/i18n-ui";

export interface WorkbookCardProps {
  handleDownload: () => void | Promise<void>;
  handleUpload: () => void | Promise<void>;
  isDownloading: boolean;
  isUploading: boolean;
  selCountry: CountryRow | null;
  setUploadFile: Dispatch<SetStateAction<File | null>>;
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
  t: (source: string) => string;
  uploadFile: File | null;
  uploadSummary: UploadSummary | null;
}

export function WorkbookCard({
  handleDownload,
  handleUpload,
  isDownloading,
  isUploading,
  selCountry,
  setUploadFile,
  showSnackbar,
  t,
  uploadFile,
  uploadSummary,
}: WorkbookCardProps) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
      <div
        className="px-4 py-3"
        style={{
          backgroundColor: COLORS.brightGrayNew,
          borderBottom: `1px solid ${COLORS.americanDiamond}`,
        }}
      >
        <p
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: COLORS.darkAquamarineGreen }}
        >
          {t("Bulk upsert via workbook")}
        </p>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs mb-3" style={{ color: COLORS.darkSilver, lineHeight: 1.5 }}>
          {fillText(
            t(
              "Export all feed names across languages for ${country} as a workbook, edit offline, then import to upsert in bulk."
            ),
            { country: selCountry?.name ?? t("the selected country") }
          )}
        </p>
        <div className="flex gap-2 mb-3">
          <button
            onClick={handleDownload}
            disabled={isDownloading || !selCountry}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm"
            style={{
              backgroundColor: "transparent",
              color: COLORS.darkAquamarineGreen,
              border: `1.5px solid ${COLORS.darkAquamarineGreen}`,
              cursor: isDownloading || !selCountry ? "not-allowed" : "pointer",
              opacity: !selCountry ? 0.5 : 1,
            }}
          >
            {isDownloading ? t("Downloading…") : t("↓ Export")}
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading || !uploadFile || !selCountry}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm"
            style={{
              backgroundColor:
                isUploading || !uploadFile || !selCountry
                  ? COLORS.lightGrayNew
                  : COLORS.darkAquamarineGreen,
              color: COLORS.white,
              border: "none",
              cursor: isUploading || !uploadFile || !selCountry ? "not-allowed" : "pointer",
            }}
          >
            {isUploading ? t("Uploading…") : t("↑ Import")}
          </button>
        </div>
        <input
          type="file"
          aria-label={t("Translation workbook file")}
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            const problem = file && uploadFileProblem(file, [".xlsx", ".xls"], t);
            if (problem) {
              e.target.value = "";
              showSnackbar(problem, "error");
              return;
            }
            setUploadFile(file);
          }}
          className="block w-full text-sm"
          style={{ color: COLORS.raisinBlack }}
        />
        {uploadSummary && (
          <div
            className="mt-3 rounded-xl px-3 py-3"
            style={{
              backgroundColor:
                uploadSummary.success === false ? COLORS.peachyPink : COLORS.honeydew,
              border: `1px solid ${uploadSummary.success === false ? "rgba(228,74,74,0.25)" : "rgba(5,188,109,0.20)"}`,
            }}
          >
            <p
              className="font-bold text-sm mb-1"
              style={{
                color:
                  uploadSummary.success === false ? COLORS.carminePink : COLORS.darkAquamarineGreen,
              }}
            >
              {uploadSummary.success === false ? t("Import failed") : t("Import summary")}
            </p>
            <div className="text-xs space-y-0.5" style={{ color: COLORS.raisinBlack }}>
              <p>
                {fillText(
                  t("Feeds — ${added} added · ${updated} updated · ${unchanged} unchanged"),
                  {
                    added: uploadSummary.feeds_inserted ?? 0,
                    updated: uploadSummary.feeds_updated ?? 0,
                    unchanged: uploadSummary.feeds_skipped ?? 0,
                  }
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

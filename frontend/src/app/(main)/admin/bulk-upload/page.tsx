"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { bulkUploadFeeds, exportAdminFeeds, exportCustomFeeds } from "@/lib/api";
import Toolbar from "@/components/Toolbar";

/** Section header with left green accent bar (matches Android sub-section style) */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mt-5 ml-3">
      <span style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: "#064E3B" }} />
      <p
        className="font-bold uppercase tracking-wide"
        style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 14 }}
      >
        {children}
      </p>
    </div>
  );
}

export default function BulkUploadPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCustom, setIsExportingCustom] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file || !user?.id) return;
    setIsUploading(true);
    try {
      const res = await bulkUploadFeeds(user.id, file);
      const msg = res.data?.message ?? "Upload successful";
      showSnackbar(msg, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      showSnackbar(msg, "error");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const TEMPLATE_URL =
    "https://ucd-reports.s3.ap-southeast-2.amazonaws.com/feed_exports/template_upload/feeds_table_tempate.xlsx";

  const handleDownloadTemplate = () => {
    setIsDownloadingTemplate(true);
    const a = document.createElement("a");
    a.href = TEMPLATE_URL;
    a.download = "feeds_table_template.xlsx";
    a.click();
    // Template is direct CDN; treat as success after the click
    setTimeout(() => {
      setIsDownloadingTemplate(false);
      showSnackbar("Template downloaded", "success");
    }, 500);
  };

  const triggerDownload = (res: { data: { url?: string; file_url?: string; record_count?: number } }, filename: string, isCustom: boolean) => {
    const url = res.data?.url ?? res.data?.file_url;
    const count = res.data?.record_count;
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    }
    setExportSuccess(
      count !== undefined
        ? `${isCustom ? "Custom f" : "F"}eeds exported successfully. ${count} record${count === 1 ? "" : "s"} exported.`
        : `${isCustom ? "Custom f" : "F"}eeds exported successfully.`
    );
  };

  const handleExport = async () => {
    if (!user?.id) return;
    setIsExporting(true);
    setExportSuccess(null);
    try {
      const res = await exportAdminFeeds(user.id);
      triggerDownload(res, "feeds_export.csv", false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      showSnackbar(msg, "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCustom = async () => {
    if (!user?.id) return;
    setIsExportingCustom(true);
    setExportSuccess(null);
    try {
      const res = await exportCustomFeeds(user.id);
      triggerDownload(res, "custom_feeds_export.csv", true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      showSnackbar(msg, "error");
    } finally {
      setIsExportingCustom(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)" }}>
      <Toolbar type="back" title="Feed Management" onBack={() => router.back()} />

      {/* Page header */}
      <div className="ml-3 mt-5">
        <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>Data Sync</p>
        <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 20 }}>Feed Export & Upload</p>
      </div>

      <div className="flex-1 overflow-y-auto pb-28">
        {/* ── UPLOAD ── */}
        <SectionHeader>Upload</SectionHeader>
        <div
          className="mx-3 mt-3 bg-white rounded-2xl px-3 py-3"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          {/* Dashed picker */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="w-full flex flex-col items-center justify-center rounded-2xl"
            style={{
              border: "2px dashed #007BFF",
              backgroundColor: "#F6F9FD",
              padding: "32px 16px",
              cursor: isUploading ? "not-allowed" : "pointer",
            }}
          >
            <span
              className="flex items-center justify-center"
              style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: "#007BFF" }}
            >
              {isUploading ? (
                <svg className="animate-spin" width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M16 16l-4-4-4 4M12 12v9" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <p
              className="font-bold uppercase tracking-wide mt-3"
              style={{ color: "#1E40AF", fontFamily: "Nunito, sans-serif", fontSize: 16 }}
            >
              {isUploading ? "Uploading..." : "Upload Feeds"}
            </p>
            <p
              className="mt-1"
              style={{ color: "#2563EB", fontFamily: "Nunito, sans-serif", fontSize: 12 }}
            >
              Tap to browse CSV or Excel
            </p>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <p
            className="mt-3 text-center italic"
            style={{ color: "#999999", fontFamily: "Nunito, sans-serif", fontSize: 12 }}
          >
            * Only files stored on your device are supported.
          </p>
        </div>

        {/* ── DOWNLOAD ── */}
        <SectionHeader>Download</SectionHeader>
        <div
          className="mx-3 mt-3 bg-white rounded-2xl px-3 py-3"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          <div className="grid grid-cols-2 gap-3">
            {/* STANDARD Feeds — Android honeydew bg + dark_green_turquoise icon */}
            <button
              onClick={handleExport}
              disabled={isExporting || isExportingCustom}
              className="flex flex-col items-start rounded-2xl px-3 py-4"
              style={{
                backgroundColor: "#F0FDF4",
                border: "1px solid rgba(16,185,129,0.18)",
                cursor: isExporting || isExportingCustom ? "not-allowed" : "pointer",
                opacity: isExporting || isExportingCustom ? 0.7 : 1,
              }}
            >
              <span
                className="flex items-center justify-center"
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#FFFFFF" }}
              >
                {isExporting ? (
                  <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#10B981" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                  </svg>
                ) : (
                  /* database / standard icon */
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <ellipse cx="12" cy="5" rx="8" ry="2.5" stroke="#10B981" strokeWidth="1.8" />
                    <path d="M4 5v14c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V5" stroke="#10B981" strokeWidth="1.8" />
                    <path d="M4 12c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5" stroke="#10B981" strokeWidth="1.8" />
                  </svg>
                )}
              </span>
              <p className="font-bold uppercase tracking-wide mt-3" style={{ color: "#069460", fontFamily: "Nunito, sans-serif", fontSize: 13 }}>
                Standard
              </p>
              <p className="font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 18, marginTop: 2 }}>
                Feeds
              </p>
            </button>

            {/* FILTERED Custom Feeds — Android aesthetic_white bg + hot_orange icon */}
            <button
              onClick={handleExportCustom}
              disabled={isExporting || isExportingCustom}
              className="flex flex-col items-start rounded-2xl px-3 py-4"
              style={{
                backgroundColor: "#FFFAF2",
                border: "1px solid rgba(255,109,0,0.18)",
                cursor: isExporting || isExportingCustom ? "not-allowed" : "pointer",
                opacity: isExporting || isExportingCustom ? 0.7 : 1,
              }}
            >
              <span
                className="flex items-center justify-center"
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#FFFFFF" }}
              >
                {isExportingCustom ? (
                  <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#FF6D00" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                  </svg>
                ) : (
                  /* hub / filtered icon */
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="2.5" fill="#FF6D00" />
                    <circle cx="12" cy="4" r="1.8" fill="#FF6D00" />
                    <circle cx="12" cy="20" r="1.8" fill="#FF6D00" />
                    <circle cx="4" cy="12" r="1.8" fill="#FF6D00" />
                    <circle cx="20" cy="12" r="1.8" fill="#FF6D00" />
                    <path d="M12 6.5v3M12 14.5v3M5.8 12h3.7M14.5 12h3.7" stroke="#FF6D00" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <p className="font-bold uppercase tracking-wide mt-3" style={{ color: "#E65100", fontFamily: "Nunito, sans-serif", fontSize: 13 }}>
                Filtered
              </p>
              <p className="font-bold" style={{ color: "#3E2723", fontFamily: "Nunito, sans-serif", fontSize: 18, marginTop: 2 }}>
                Custom Feeds
              </p>
            </button>
          </div>

          {/* Export Successful notification */}
          {exportSuccess && (
            <>
              <div style={{ height: 1, backgroundColor: "#064E3B", marginTop: 16, marginBottom: 12 }} />
              <div
                className="flex items-start gap-3 px-3 py-3 rounded-2xl"
                style={{ backgroundColor: "#E4F7EF", border: "1px solid rgba(5,188,109,0.25)" }}
              >
                <span
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "#1CA069" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5L20 7" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>
                    Export Successful
                  </p>
                  <p style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 13, marginTop: 2 }}>
                    {exportSuccess}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fixed bottom Download Template button (green gradient) */}
      <div
        className="px-3 py-3"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: "100%",
          backgroundColor: "transparent",
          zIndex: 30,
        }}
      >
        <button
          onClick={handleDownloadTemplate}
          disabled={isDownloadingTemplate}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base text-white"
          style={{
            background: "linear-gradient(180deg, #1CA069 0%, #064E3B 100%)",
            border: "none",
            cursor: isDownloadingTemplate ? "not-allowed" : "pointer",
            fontFamily: "Nunito, sans-serif",
            boxShadow: "0 4px 14px rgba(6,78,59,0.28)",
          }}
        >
          {isDownloadingTemplate ? "Downloading..." : "Download Template"}
          <span
            className="flex items-center justify-center"
            style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: "#FFFFFF" }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v8M3.5 7L7 10.5L10.5 7M2 12h10" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}

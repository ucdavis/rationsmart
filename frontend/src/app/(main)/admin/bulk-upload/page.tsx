"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { bulkUploadFeeds, exportAdminFeeds, exportCustomFeeds } from "@/lib/api";
import Toolbar from "@/components/Toolbar";
import { IcBulkUpload } from "@/components/Icons";

export default function BulkUploadPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCustom, setIsExportingCustom] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !user?.id) return;
    setIsUploading(true);
    try {
      const res = await bulkUploadFeeds(user.id, selectedFile);
      const msg = res.data?.message ?? "Upload successful";
      setUploadResult(msg);
      showSnackbar(msg, "success");
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      showSnackbar(msg, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const TEMPLATE_URL =
    "https://ucd-reports.s3.ap-southeast-2.amazonaws.com/feed_exports/template_upload/feeds_table_tempate.xlsx";

  const handleDownloadTemplate = () => {
    const a = document.createElement("a");
    a.href = TEMPLATE_URL;
    a.download = "feeds_table_template.xlsx";
    a.click();
  };

  const triggerDownload = (res: { data: { url?: string; file_url?: string } }, filename: string) => {
    const url = res.data?.url ?? res.data?.file_url;
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      showSnackbar("Export started", "success");
    } else {
      showSnackbar("Export complete", "success");
    }
  };

  const handleExport = async () => {
    if (!user?.id) return;
    setIsExporting(true);
    try {
      const res = await exportAdminFeeds(user.id);
      triggerDownload(res, "feeds_export.csv");
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
    try {
      const res = await exportCustomFeeds(user.id);
      triggerDownload(res, "custom_feeds_export.csv");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      showSnackbar(msg, "error");
    } finally {
      setIsExportingCustom(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Bulk Upload" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto px-3 pt-4 pb-8">
        {/* Upload card */}
        <div
          className="rounded-2xl bg-white px-4 py-5 mb-4"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          <p className="text-base font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            Bulk Upload Feeds
          </p>
          <p className="text-xs mb-4" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            Upload a CSV or Excel file to add multiple feeds at once
          </p>

          {/* File picker */}
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center justify-center rounded-2xl py-8 mb-4"
            style={{
              border: "2px dashed #064E3B",
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
          >
            <IcBulkUpload size={36} color="#064E3B" />
            <p className="text-sm font-bold mt-3" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
              {selectedFile ? selectedFile.name : "Tap to select file"}
            </p>
            {!selectedFile && (
              <p className="text-xs mt-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                CSV or Excel (.csv, .xlsx)
              </p>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor: selectedFile && !isUploading ? "#064E3B" : "#D3D3D3",
              color: selectedFile && !isUploading ? "white" : "#999999",
              border: "none",
              fontFamily: "Nunito, sans-serif",
              cursor: selectedFile && !isUploading ? "pointer" : "not-allowed",
            }}
          >
            {isUploading ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                Uploading...
              </>
            ) : "Upload Feeds"}
          </button>

          {uploadResult && (
            <p className="text-sm font-bold text-center mt-3" style={{ color: "#05BC6D", fontFamily: "Nunito, sans-serif" }}>
              {uploadResult}
            </p>
          )}
        </div>

        {/* Download Template card */}
        <div
          className="rounded-2xl bg-white px-4 py-5 mb-4"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          <p className="text-base font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            Download Template
          </p>
          <p className="text-xs mb-4" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            Download the Excel template to fill in feed data for bulk upload
          </p>
          <button
            onClick={handleDownloadTemplate}
            className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor: "transparent",
              color: "#064E3B",
              border: "2px solid #064E3B",
              fontFamily: "Nunito, sans-serif",
              cursor: "pointer",
            }}
          >
            Download Template (.xlsx)
          </button>
        </div>

        {/* Export Feeds card */}
        <div
          className="rounded-2xl bg-white px-4 py-5 mb-4"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          <p className="text-base font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            Export Feeds
          </p>
          <p className="text-xs mb-4" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            Download the current feed database as a CSV file
          </p>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor: "transparent",
              color: isExporting ? "#999999" : "#064E3B",
              border: `2px solid ${isExporting ? "#D3D3D3" : "#064E3B"}`,
              fontFamily: "Nunito, sans-serif",
              cursor: isExporting ? "not-allowed" : "pointer",
            }}
          >
            {isExporting ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                Exporting...
              </>
            ) : "Export Feeds"}
          </button>
        </div>

        {/* Export Custom Feeds card */}
        <div
          className="rounded-2xl bg-white px-4 py-5"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          <p className="text-base font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            Export Custom Feeds
          </p>
          <p className="text-xs mb-4" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            Download custom (user-added) feeds as a CSV file
          </p>
          <button
            onClick={handleExportCustom}
            disabled={isExportingCustom}
            className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor: "transparent",
              color: isExportingCustom ? "#999999" : "#064E3B",
              border: `2px solid ${isExportingCustom ? "#D3D3D3" : "#064E3B"}`,
              fontFamily: "Nunito, sans-serif",
              cursor: isExportingCustom ? "not-allowed" : "pointer",
            }}
          >
            {isExportingCustom ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                Exporting...
              </>
            ) : "Export Custom Feeds"}
          </button>
        </div>
      </div>
    </div>
  );
}

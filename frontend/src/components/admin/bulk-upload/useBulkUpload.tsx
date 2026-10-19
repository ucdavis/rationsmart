"use client";

// Bulk Upload & Export — state and handlers for the three actions on the
// page: upload a feed file, export standard / custom feeds, download the
// upload template. Split out of admin/bulk-upload/page.tsx (audit B-17).

import { useRef, useState } from "react";
import {
  bulkUploadFeeds,
  downloadFeedTemplate,
  exportAdminFeeds,
  exportCustomFeeds,
} from "@/lib/api";
import type { User } from "@/lib/store";
import { isSameOrigin, safeExternalUrl } from "@/lib/safe-url";
import {
  contentDispositionOf,
  filenameFromContentDisposition,
  uploadFileProblem,
  saveBlob,
} from "@/lib/download";
import { asRecord, messageOf, numberField, stringField } from "@/lib/api-client/normalize";
import { COLORS } from "@/lib/colors";
import Spinner from "@/components/ui/Spinner";

// Upload template — GET /v1/admin/feed-template (has the mandatory fd_code /
// fd_language_cd columns). Saved under the backend's own file name.
const FEED_TEMPLATE_FILENAME = "rs_template_feed_upload.xlsx";

// Fills `${key}` placeholder tokens in a translated template. Only used
// for the two messages on this page whose dictionary entries carry
// literal placeholder tokens matching the English source exactly (e.g.
// hi.json: "Exported ${count} record${s}.", "Downloaded ${fileName}
// (${size} KB)."). Never used on backend-supplied messages — those are
// shown verbatim and never passed through t() at all.
function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.split(`\${${key}}`).join(value),
    template
  );
}

// Success text for a feed-sync run-from-file result (FeedSyncLogDetailResponse:
// total_rows / inserted / updated / skipped). Falls back to a backend
// `message`, then a generic line, if the counts aren't there.
function uploadSummary(data: unknown, t: (s: string) => string): string {
  const inserted = numberField(data, "inserted");
  const updated = numberField(data, "updated");
  const skipped = numberField(data, "skipped");
  if (inserted == null || updated == null || skipped == null) {
    return messageOf(data) ?? t("Feeds uploaded successfully.");
  }
  const total = numberField(data, "total_rows") ?? inserted + updated + skipped;
  const summary = fillTemplate(
    t("Processed ${total} rows: ${inserted} added, ${updated} updated, ${skipped} skipped."),
    {
      total: String(total),
      inserted: String(inserted),
      updated: String(updated),
      skipped: String(skipped),
    }
  );
  return skipped > 0
    ? `${summary} ${t("See Feed Library Sync > Run History for the skipped rows.")}`
    : summary;
}

// Upload / download status — mirrors Android adminVM.uploadFeedsResponse
// and exportFeedsResponse UiData states (Loading / Success / Error).
type UploadStatus = "idle" | "uploading" | "successful" | "failed";
type DownloadStatus = "idle" | "downloading" | "successful" | "failed";
type ExportKind = "standard" | "custom";

type Snackbar = (message: string, type?: "success" | "error" | "info") => void;

export function useBulkUpload(user: User | null, showSnackbar: Snackbar, t: (s: string) => string) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Upload state (matches FragmentBulkUpload.uploadFeedsResponse observer)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  // Download state (matches FragmentBulkUpload.exportFeedsResponse observer)
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("idle");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadKind, setDownloadKind] = useState<ExportKind>("standard");

  // File preview — step 1: user picks file, we show the cv_file_container
  // card. Upload only fires when user taps the green "done" check button.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const problem = uploadFileProblem(file, [".csv", ".xlsx", ".xls"], t);
    if (problem) {
      e.target.value = "";
      setUploadStatus("failed");
      setUploadMessage(problem);
      return;
    }
    setSelectedFile(file);
    // Reset any prior upload status when a new file is picked
    setUploadStatus("idle");
    setUploadMessage("");
    setUploadProgress(0);
  };

  const handleCancelFile = () => {
    setSelectedFile(null);
    setUploadStatus("idle");
    setUploadMessage("");
    setUploadProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile || !user?.id) return;
    setUploadStatus("uploading");
    setUploadMessage(t("Your feeds are being uploaded."));
    setUploadProgress(0);
    try {
      const res = await bulkUploadFeeds(user.id, selectedFile, (pct) => setUploadProgress(pct));
      setUploadProgress(100);
      // The feed-sync run-from-file endpoint answers 200 with the finished
      // run log even when the run itself failed (success: false +
      // error_message), so the status comes from the body, not the HTTP code.
      const run = asRecord(res.data);
      if (run?.success === false) {
        setUploadStatus("failed");
        setUploadMessage(stringField(run, "error_message") ?? t("Could not upload feeds."));
        return;
      }
      setUploadStatus("successful");
      setUploadMessage(uploadSummary(res.data, t));
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      setUploadStatus("failed");
      setUploadMessage(err instanceof Error ? err.message : t("Could not upload feeds."));
    }
  };

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      const res = await downloadFeedTemplate();
      const blob = res.data as Blob;
      if (blob.size === 0) {
        showSnackbar(t("Backend returned an empty file."), "error");
        return;
      }
      saveBlob(blob, FEED_TEMPLATE_FILENAME);
      showSnackbar(t("Template downloaded"), "success");
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : t("An unexpected error occurred"), "error");
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const triggerDownload = (url: string, filename: string) => {
    // Cross-origin pitfall: when the URL points at a different origin
    // (e.g. an S3 bucket), browsers SILENTLY IGNORE the `download`
    // attribute as a security measure. The result is either a no-op or
    // a same-tab navigation away from the page — which is exactly what
    // the user reported ("downloading… export successful" but no file
    // ever lands).
    //
    // Workaround: detect cross-origin URLs and open them in a new tab
    // instead. S3 / the backend should be setting Content-Disposition:
    // attachment on the file, which makes the browser save it on open.
    // For same-origin URLs the original <a download> trick still works
    // and lets us rename the file.
    const safe = safeExternalUrl(url);
    if (!safe) {
      setDownloadStatus("failed");
      setDownloadMessage(t("Backend returned an unparseable response."));
      return;
    }
    if (!isSameOrigin(safe)) {
      window.open(safe.href, "_blank", "noopener,noreferrer");
      return;
    }
    const a = document.createElement("a");
    a.href = safe.href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const runExport = async (kind: ExportKind) => {
    if (!user?.id) return;
    setDownloadKind(kind);
    setDownloadStatus("downloading");
    setDownloadMessage(t("Your feeds are being downloaded."));
    setDownloadProgress(0);
    try {
      const res =
        kind === "standard" ? await exportAdminFeeds(user.id) : await exportCustomFeeds(user.id);

      // The v1 backend may return EITHER:
      //   A) JSON { file_url, file_name, ... } — legacy Android shape.
      //      The frontend opens the file_url to download.
      //   B) The xlsx file BINARY directly with Content-Disposition:
      //      attachment — likely on the v1 backend, since the swagger
      //      response schema is empty for these endpoints.
      // Both are requested as `responseType: "blob"` in api.ts, so
      // res.data is a Blob in both cases. We sniff the Content-Type
      // header to decide which branch to follow.
      const ctRaw = (res.headers["content-type"] || res.headers["Content-Type"] || "") as string;
      const contentType = ctRaw.toLowerCase();
      const isJson = contentType.includes("application/json");
      const fallbackName = kind === "standard" ? "feeds_export.xlsx" : "custom_feeds_export.xlsx";

      if (isJson) {
        // Response is JSON wrapped in a Blob — read the text and parse.
        const text = await (res.data as Blob).text();
        let parsed: {
          success?: boolean;
          message?: string;
          url?: string;
          file_url?: string;
          fileUrl?: string;
          file_name?: string;
          fileName?: string;
          record_count?: number;
          total_records?: number;
        } = {};
        try {
          parsed = JSON.parse(text);
        } catch {
          // Server returned text/json that isn't actually JSON — bail.
          setDownloadStatus("failed");
          setDownloadMessage(t("Backend returned an unparseable response."));
          return;
        }
        if (parsed?.success === false) {
          setDownloadStatus("failed");
          setDownloadMessage(parsed?.message ?? t("Could not export feeds."));
          return;
        }
        const url = parsed?.file_url ?? parsed?.url ?? parsed?.fileUrl;
        const fileName = parsed?.file_name ?? parsed?.fileName ?? fallbackName;
        const recordCount = parsed?.record_count ?? parsed?.total_records;
        if (url) {
          triggerDownload(url, fileName);
        } else {
          setDownloadStatus("failed");
          setDownloadMessage(
            t("Export completed but the backend did not return a file URL. Contact admin.")
          );
          return;
        }
        setDownloadProgress(100);
        setDownloadStatus("successful");
        setDownloadMessage(
          parsed?.message ??
            (recordCount != null
              ? fillTemplate(t("Exported ${count} record${s}."), {
                  count: String(recordCount),
                  s: recordCount === 1 ? "" : "s",
                })
              : t("Feeds exported successfully."))
        );
      } else {
        // Response is the xlsx binary. Save it directly via a blob URL.
        // Parse the filename out of Content-Disposition when the
        // backend provides one (e.g. attachment; filename="feeds.xlsx").
        const fileName = filenameFromContentDisposition(
          contentDispositionOf(res.headers),
          fallbackName
        );
        const blob = res.data as Blob;
        // Size sanity check — backend sometimes returns an empty 200
        // when there are no rows. Surface that explicitly.
        if (blob.size === 0) {
          setDownloadStatus("failed");
          setDownloadMessage(t("Backend returned an empty file."));
          return;
        }
        saveBlob(blob, fileName);
        setDownloadProgress(100);
        setDownloadStatus("successful");
        setDownloadMessage(
          fillTemplate(t("Downloaded ${fileName} (${size} KB)."), {
            fileName,
            size: (blob.size / 1024).toFixed(1),
          })
        );
      }
    } catch (err: unknown) {
      setDownloadStatus("failed");
      setDownloadMessage(err instanceof Error ? err.message : t("Could not export feeds."));
    }
  };

  // ── Status banner helpers ─────────────────────────────────────────────
  // Android cv_upload_status (water bg, celtic_blue_25 stroke, ultramarine
  // text) while uploading; honeydew/go_green_15/dark_aquamarine_green on
  // success; carmine_pink_20/red_ryb on failure.
  const uploadBanner = (() => {
    switch (uploadStatus) {
      case "uploading":
        return {
          title: t("Uploading"),
          bg: COLORS.water,
          stroke: "rgba(41,108,211,0.25)",
          iconBg: COLORS.azure,
          titleColor: COLORS.ultramarine,
          msgColor: COLORS.mirrorBlue,
          progressColor: COLORS.celticBlue,
          trackColor: "rgba(41,108,211,0.15)",
        };
      case "successful":
        return {
          title: t("Upload Successful"),
          bg: COLORS.honeydew,
          stroke: "rgba(5,188,109,0.25)",
          iconBg: COLORS.crayolaGreen,
          titleColor: COLORS.darkAquamarineGreen,
          msgColor: COLORS.darkAquamarineGreen,
          progressColor: COLORS.darkAquamarineGreen,
          trackColor: COLORS.goGreen15,
        };
      case "failed":
        return {
          title: t("Upload Failed"),
          bg: "rgba(228,74,74,0.10)",
          stroke: "rgba(228,74,74,0.25)",
          iconBg: COLORS.redRyb,
          titleColor: COLORS.carminePink,
          msgColor: COLORS.carminePink,
          progressColor: COLORS.redRyb,
          trackColor: "rgba(228,74,74,0.15)",
        };
      default:
        return null;
    }
  })();

  // Standard export uses green theme; Custom export uses orange (vivid_gamboge) theme.
  const downloadBanner = (() => {
    if (downloadStatus === "idle") return null;
    if (downloadStatus === "downloading" || downloadStatus === "successful") {
      if (downloadKind === "standard") {
        return {
          title: downloadStatus === "downloading" ? t("Downloading") : t("Export Successful"),
          bg: COLORS.honeydew,
          stroke: "rgba(5,188,109,0.25)",
          iconBg: COLORS.crayolaGreen,
          titleColor: COLORS.darkAquamarineGreen,
          msgColor: COLORS.greenOnyx,
          progressColor: COLORS.darkAquamarineGreen,
          trackColor: COLORS.goGreen15,
        };
      }
      return {
        title: downloadStatus === "downloading" ? t("Downloading") : t("Export Successful"),
        bg: "rgba(255,152,0,0.10)",
        stroke: "rgba(255,152,0,0.30)",
        iconBg: COLORS.hotOrange,
        titleColor: COLORS.fireOrange,
        msgColor: COLORS.vividGamboge,
        progressColor: COLORS.vividGamboge,
        trackColor: "rgba(255,152,0,0.15)",
      };
    }
    // failed
    return {
      title: t("Export Failed"),
      bg: "rgba(228,74,74,0.10)",
      stroke: "rgba(228,74,74,0.25)",
      iconBg: COLORS.redRyb,
      titleColor: COLORS.carminePink,
      msgColor: COLORS.carminePink,
      progressColor: COLORS.redRyb,
      trackColor: "rgba(228,74,74,0.15)",
    };
  })();

  const renderStatusIcon = (kind: "uploading" | "downloading" | "successful" | "failed") => {
    if (kind === "successful") {
      // ic_done — material check
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12l5 5L20 7"
            stroke={COLORS.white}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    if (kind === "failed") {
      // ic_failed — exclamation in triangle / X
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke={COLORS.white}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      );
    }
    // uploading / downloading — animated rotating ring (matches Android
    // ic_uploading / ic_downloading which are animated drawables)
    return (
      <span style={{ color: COLORS.white, display: "inline-flex" }}>
        <Spinner size={14} />
      </span>
    );
  };

  return {
    fileRef,
    selectedFile,
    isDownloadingTemplate,
    uploadStatus,
    uploadMessage,
    uploadProgress,
    downloadStatus,
    downloadMessage,
    downloadProgress,
    handleFileChange,
    handleCancelFile,
    handleConfirmUpload,
    handleDownloadTemplate,
    runExport,
    uploadBanner,
    downloadBanner,
    renderStatusIcon,
  };
}

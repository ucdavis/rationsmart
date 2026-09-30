"use client";

import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import { useBulkUpload } from "@/components/admin/bulk-upload/useBulkUpload";
import { useT } from "@/lib/i18n-ui";
import { COLUMN_WIDTH } from "@/lib/column";
import { COLORS, ADMIN_BACKGROUND } from "@/lib/colors";

// Section header — Android shows a vertical pin (size_6 × size_30,
// bg_vertical_pin = dark_aquamarine_green) + bold sentence-case title
// in dark_aquamarine_green font_16. Previous "UPLOAD"/"DOWNLOAD"
// uppercase styling did not match Android.
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mt-5 ml-3">
      <span
        style={{
          width: 6,
          height: 30,
          borderRadius: 3,
          backgroundColor: COLORS.darkAquamarineGreen,
        }}
      />
      <p className="font-bold" style={{ color: COLORS.darkAquamarineGreen, fontSize: 16 }}>
        {children}
      </p>
    </div>
  );
}

export default function BulkUploadPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));
  const t = useT();
  const {
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
  } = useBulkUpload(user, showSnackbar, t);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: ADMIN_BACKGROUND }}>
      <Toolbar type="back" title={t("Feed Management")} onBack={() => router.back()} />

      {/* Page header — matches Android tv_title_data_sync / tv_title_feed_export_upload */}
      <div className="ml-3 mt-5">
        <p style={{ color: COLORS.darkSilver, fontSize: 14 }}>{t("Data Sync")}</p>
        <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 20 }}>
          {t("Feed Export & Upload")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-28">
        {/* ── UPLOAD ── */}
        <SectionHeader>{t("Upload")}</SectionHeader>
        <div
          className="mx-3 mt-3 bg-white rounded-2xl px-5 pt-5 pb-4"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          {/* Dashed picker — Android bg_upload_feeds (dashed azure border on
              azure_15 bg with ic_upload in azure pill). */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadStatus === "uploading"}
            className="w-full flex flex-col items-center justify-center rounded-2xl"
            style={{
              border: `2px dashed ${COLORS.azure}`,
              backgroundColor: COLORS.ghostWhite,
              padding: "32px 16px",
              cursor: uploadStatus === "uploading" ? "not-allowed" : "pointer",
            }}
          >
            <span
              className="flex items-center justify-center"
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: COLORS.azure,
                boxShadow: "0 4px 12px rgba(0,123,255,0.25)",
              }}
            >
              {/* ic_upload — Material cloud-with-arrow */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill={COLORS.white}>
                <path d="M19,11c0,-3.87 -3.13,-7 -7,-7C8.78,4 6.07,6.18 5.26,9.15C2.82,9.71 1,11.89 1,14.5C1,17.54 3.46,20 6.5,20c1.76,0 10.25,0 12,0l0,0c2.49,-0.01 4.5,-2.03 4.5,-4.52C23,13.15 21.25,11.26 19,11zM13,13v2c0,0.55 -0.45,1 -1,1h0c-0.55,0 -1,-0.45 -1,-1v-2H9.21c-0.45,0 -0.67,-0.54 -0.35,-0.85l2.79,-2.79c0.2,-0.2 0.51,-0.2 0.71,0l2.79,2.79c0.31,0.31 0.09,0.85 -0.35,0.85H13z" />
              </svg>
            </span>
            {/* "UPLOAD FEEDS" (ultramarine, bold, font_16) */}
            <p className="font-bold mt-4" style={{ color: COLORS.ultramarine, fontSize: 16 }}>
              {t("UPLOAD FEEDS")}
            </p>
            {/* "Tap to browse CSV or Excel" (mirror_blue, regular, font_12) */}
            <p
              style={{
                color: COLORS.mirrorBlue,
                fontSize: 12,
                marginTop: 10,
              }}
            >
              {t("Tap to browse CSV or Excel")}
            </p>
          </button>
          <input
            ref={fileRef}
            aria-label={t("Feed file (CSV or Excel)")}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          {/* Selected file preview — cv_file_container in Android.
              White card with go_green_25 1dp stroke, mint_whisper file icon
              pill, filename, cancel (carmine_pink_20 + red_ryb) and done
              (go_green_15 + dark_aquamarine_green) circular icon buttons. */}
          {selectedFile && uploadStatus !== "uploading" && (
            <div
              className="mt-5 flex items-center"
              style={{
                backgroundColor: COLORS.white,
                border: "1px solid rgba(5,188,109,0.40)",
                borderRadius: 20,
                padding: 10,
                gap: 10,
              }}
            >
              {/* ic_file inside mint_whisper pill */}
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: COLORS.mintWhisper, borderRadius: 8, padding: 8 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill={COLORS.darkAquamarineGreen}>
                  <path d="M14,2H6C4.9,2 4,2.9 4,4v16c0,1.1 0.9,2 2,2h12c1.1,0 2,-0.9 2,-2V8L14,2zM6,20V4h7v5h5v11H6z" />
                </svg>
              </div>
              <p
                className="flex-1 min-w-0 truncate"
                style={{ color: COLORS.darkAquamarineGreen, fontSize: 12 }}
              >
                {selectedFile.name}
              </p>
              {/* Cancel (X) */}
              <button
                onClick={handleCancelFile}
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: "rgba(228,74,74,0.20)",
                  borderRadius: 60,
                  padding: 6,
                  border: "none",
                  cursor: "pointer",
                }}
                aria-label={t("Cancel file")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke={COLORS.redRyb}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {/* Done (✓) — fires upload */}
              <button
                onClick={handleConfirmUpload}
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: COLORS.goGreen15,
                  borderRadius: 60,
                  padding: 6,
                  border: "none",
                  cursor: "pointer",
                }}
                aria-label={t("Confirm upload")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12l5 5L20 7"
                    stroke={COLORS.darkAquamarineGreen}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Linear progress + Upload status banner — Android
              lpi_upload_progress + cv_upload_status. */}
          {uploadBanner && (
            <>
              <div
                className="mt-5"
                style={{
                  width: "100%",
                  height: 6,
                  borderRadius: 6,
                  backgroundColor: uploadBanner.trackColor,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${uploadStatus === "uploading" ? Math.max(uploadProgress, 10) : 100}%`,
                    height: "100%",
                    backgroundColor: uploadBanner.progressColor,
                    transition: "width 0.25s",
                  }}
                />
              </div>
              <div
                className="mt-3 flex items-start gap-3 p-2.5 rounded-2xl"
                style={{
                  backgroundColor: uploadBanner.bg,
                  border: `1px solid ${uploadBanner.stroke}`,
                }}
              >
                <span
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    backgroundColor: uploadBanner.iconBg,
                  }}
                >
                  {renderStatusIcon(
                    uploadStatus === "uploading"
                      ? "uploading"
                      : uploadStatus === "successful"
                        ? "successful"
                        : "failed"
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-bold"
                    style={{
                      color: uploadBanner.titleColor,
                      fontSize: 14,
                    }}
                  >
                    {uploadBanner.title}
                  </p>
                  <p
                    style={{
                      color: uploadBanner.msgColor,
                      fontSize: 13,
                      marginTop: 2,
                    }}
                  >
                    {uploadMessage}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Helper text — Android "Only files stored on your device are supported." */}
          <p
            className="mt-5 text-center italic"
            style={{ color: COLORS.spanishGray, fontSize: 12 }}
          >
            {t("* Only files stored on your device are supported.")}
          </p>
        </div>

        {/* ── DOWNLOAD ── */}
        <SectionHeader>{t("Download")}</SectionHeader>
        <div
          className="mx-3 mt-3 bg-white rounded-2xl px-5 pt-5 pb-5"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          <div className="grid grid-cols-2 gap-3">
            {/* STANDARD — honeydew bg, go_green_15 stroke, dark_green_turquoise icon */}
            <button
              onClick={() => runExport("standard")}
              disabled={downloadStatus === "downloading"}
              className="flex flex-col items-start rounded-2xl px-4 py-5"
              style={{
                backgroundColor: COLORS.honeydew,
                border: "1px solid rgba(5,188,109,0.15)",
                cursor: downloadStatus === "downloading" ? "not-allowed" : "pointer",
                opacity: downloadStatus === "downloading" ? 0.7 : 1,
              }}
            >
              {/* ic_database in white pill (corner 10, content padding 6, elevation 2) */}
              <span
                className="flex items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: COLORS.white,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 960 960" fill={COLORS.darkGreenTurquoise}>
                  <path d="M480,840q-151,0 -255.5,-46.5T120,680v-400q0,-66 105.5,-113T480,120q149,0 254.5,47T840,280v400q0,67 -104.5,113.5T480,840ZM480,361q89,0 179,-25.5T760,281q-11,-29 -100.5,-55T480,200q-91,0 -178.5,25.5T200,281q14,30 101.5,55T480,361ZM480,560q42,0 81,-4t74.5,-11.5q35.5,-7.5 67,-18.5t57.5,-25v-120q-26,14 -57.5,25t-67,18.5Q600,432 561,436t-81,4q-42,0 -82,-4t-75.5,-11.5Q287,417 256,406t-56,-25v120q25,14 56,25t66.5,18.5Q358,552 398,556t82,4ZM480,760q46,0 93.5,-7t87.5,-18.5q40,-11.5 67,-26t32,-29.5v-98q-26,14 -57.5,25t-67,18.5Q600,632 561,636t-81,4q-42,0 -82,-4t-75.5,-11.5Q287,617 256,606t-56,-25v99q5,15 31.5,29t66.5,25.5q40,11.5 88,18.5t94,7Z" />
                </svg>
              </span>
              <p className="font-bold mt-4" style={{ color: COLORS.greenOnyx, fontSize: 12 }}>
                {t("STANDARD")}
              </p>
              <p className="font-bold" style={{ color: COLORS.darkAquamarineGreen, fontSize: 16 }}>
                {t("Feeds")}
              </p>
            </button>

            {/* FILTERED — aesthetic_white bg, sazerac stroke, hot_orange icon */}
            <button
              onClick={() => runExport("custom")}
              disabled={downloadStatus === "downloading"}
              className="flex flex-col items-start rounded-2xl px-4 py-5"
              style={{
                backgroundColor: COLORS.aestheticWhite,
                border: `1px solid ${COLORS.sazerac}`,
                cursor: downloadStatus === "downloading" ? "not-allowed" : "pointer",
                opacity: downloadStatus === "downloading" ? 0.7 : 1,
              }}
            >
              {/* ic_hub in white pill (Material symbol — central circle with
                  4 outer nodes connected by edges) */}
              <span
                className="flex items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: COLORS.white,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 960 960" fill={COLORS.hotOrange}>
                  <path d="M240,920q-50,0 -85,-35t-35,-85q0,-50 35,-85t85,-35q14,0 26,3t23,8l57,-71q-28,-31 -39,-70t-5,-78l-81,-27q-17,25 -43,40t-58,15q-50,0 -85,-35T0,380q0,-50 35,-85t85,-35q50,0 85,35t35,85v8l81,28q20,-36 53.5,-61t75.5,-32v-87q-39,-11 -64.5,-42.5T360,120q0,-50 35,-85t85,-35q50,0 85,35t35,85q0,42 -26,73.5T510,236v87q42,7 75.5,32t53.5,61l81,-28v-8q0,-50 35,-85t85,-35q50,0 85,35t35,85q0,50 -35,85t-85,35q-32,0 -58.5,-15T739,445l-81,27q6,39 -5,77.5T614,620l57,70q11,-5 23,-7.5t26,-2.5q50,0 85,35t35,85q0,50 -35,85t-85,35q-50,0 -85,-35t-35,-85q0,-20 6.5,-38.5T624,728l-57,-71q-41,23 -87.5,23T392,657l-56,71q11,15 17.5,33.5T360,800q0,50 -35,85t-85,35ZM120,420q17,0 28.5,-11.5T160,380q0,-17 -11.5,-28.5T120,340q-17,0 -28.5,11.5T80,380q0,17 11.5,28.5T120,420ZM240,840q17,0 28.5,-11.5T280,800q0,-17 -11.5,-28.5T240,760q-17,0 -28.5,11.5T200,800q0,17 11.5,28.5T240,840ZM480,160q17,0 28.5,-11.5T520,120q0,-17 -11.5,-28.5T480,80q-17,0 -28.5,11.5T440,120q0,17 11.5,28.5T480,160ZM480,600q42,0 71,-29t29,-71q0,-42 -29,-71t-71,-29q-42,0 -71,29t-29,71q0,42 29,71t71,29ZM720,840q17,0 28.5,-11.5T760,800q0,-17 -11.5,-28.5T720,760q-17,0 -28.5,11.5T680,800q0,17 11.5,28.5T720,840ZM840,420q17,0 28.5,-11.5T880,380q0,-17 -11.5,-28.5T840,340q-17,0 -28.5,11.5T800,380q0,17 11.5,28.5T840,420Z" />
                </svg>
              </span>
              <p className="font-bold mt-4" style={{ color: COLORS.trinidad, fontSize: 12 }}>
                {t("FILTERED")}
              </p>
              <p className="font-bold" style={{ color: COLORS.tobago, fontSize: 16 }}>
                {t("Custom Feeds")}
              </p>
            </button>
          </div>

          {/* Linear progress + Download status banner — Android
              lpi_download_progress + cv_download_status. Colors switch
              based on standard (green) vs custom (orange) themes. */}
          {downloadBanner && (
            <>
              <div
                className="mt-5"
                style={{
                  width: "100%",
                  height: 6,
                  borderRadius: 6,
                  backgroundColor: downloadBanner.trackColor,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${downloadStatus === "downloading" ? Math.max(downloadProgress, 10) : 100}%`,
                    height: "100%",
                    backgroundColor: downloadBanner.progressColor,
                    transition: "width 0.25s",
                  }}
                />
              </div>
              <div
                className="mt-3 flex items-start gap-3 p-2.5 rounded-2xl"
                style={{
                  backgroundColor: downloadBanner.bg,
                  border: `1px solid ${downloadBanner.stroke}`,
                }}
              >
                <span
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    backgroundColor: downloadBanner.iconBg,
                  }}
                >
                  {renderStatusIcon(
                    downloadStatus === "downloading"
                      ? "downloading"
                      : downloadStatus === "successful"
                        ? "successful"
                        : "failed"
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-bold"
                    style={{
                      color: downloadBanner.titleColor,
                      fontSize: 14,
                    }}
                  >
                    {downloadBanner.title}
                  </p>
                  <p
                    style={{
                      color: downloadBanner.msgColor,
                      fontSize: 13,
                      marginTop: 2,
                    }}
                  >
                    {downloadMessage}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fixed bottom Download Template button (gradient) */}
      <div
        className="px-3 py-3"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: COLUMN_WIDTH,
          backgroundColor: "transparent",
          zIndex: 30,
        }}
      >
        <button
          onClick={handleDownloadTemplate}
          disabled={isDownloadingTemplate}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base text-white"
          style={{
            background: `linear-gradient(180deg, ${COLORS.crayolaGreen} 0%, ${COLORS.darkAquamarineGreen} 100%)`,
            border: "none",
            cursor: isDownloadingTemplate ? "not-allowed" : "pointer",
            boxShadow: "0 4px 14px rgba(6,78,59,0.28)",
          }}
        >
          {isDownloadingTemplate ? t("Downloading...") : t("Download Template")}
          <span
            className="flex items-center justify-center"
            style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: COLORS.white }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 2v8M3.5 7L7 10.5L10.5 7M2 12h10"
                stroke={COLORS.darkAquamarineGreen}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}

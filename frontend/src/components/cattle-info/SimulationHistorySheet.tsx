"use client";

// Simulation History bottom sheet (Cattle Info); split out of cattle-info/page.tsx (audit B-17).
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

import type { HistoryItem } from "@/components/cattle-info/form-model";
import type React from "react";

export interface SimulationHistorySheetProps {
  historyList: HistoryItem[];
  isLoadingHistory: boolean;
  loadSimulation: (reportId: string) => Promise<void>;
  loadingSimId: string | null;
  setShowHistoryModal: React.Dispatch<React.SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function SimulationHistorySheet({
  historyList,
  isLoadingHistory,
  loadSimulation,
  loadingSimId,
  setShowHistoryModal,
  t,
}: SimulationHistorySheetProps) {
  return (
    <>
      {/* Backdrop — confined to centered column */}
      <div
        className="fixed top-0 h-full z-50"
        style={{
          left: COLUMN_LEFT,
          width: COLUMN_WIDTH,
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
        onClick={() => setShowHistoryModal(false)}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full rounded-t-3xl bg-white pb-8 overflow-y-auto"
        style={{ maxWidth: COLUMN_WIDTH, maxHeight: "80vh", zIndex: 51 }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 mb-5">
          <div
            style={{
              width: 40,
              height: 6,
              borderRadius: 3,
              backgroundColor: COLORS.goGreen15,
            }}
          />
        </div>
        {/* Title */}
        <p
          className="text-center font-bold px-3 mb-3"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
        >
          {t("Simulation History")}
        </p>

        {/* Content */}
        <div>
          {isLoadingHistory ? (
            <div className="space-y-3 px-3 pb-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white p-4 space-y-3"
                  style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
                >
                  <div
                    className="h-5 w-48 rounded shimmer"
                    style={{ backgroundColor: COLORS.webDivider }}
                  />
                  <div
                    className="h-3.5 w-36 rounded shimmer"
                    style={{ backgroundColor: COLORS.webDivider }}
                  />
                  <div
                    className="h-3.5 w-28 rounded shimmer"
                    style={{ backgroundColor: COLORS.webDivider }}
                  />
                  <div
                    className="h-3.5 w-40 rounded shimmer"
                    style={{ backgroundColor: COLORS.webDivider }}
                  />
                </div>
              ))}
            </div>
          ) : historyList.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: COLORS.darkSilver }}>
              {t("No saved simulations found")}
            </p>
          ) : (
            <div className="pb-3">
              {historyList.map((item, idx) => {
                const rowId = item.report_id ?? item.simulation_id ?? String(idx);
                const isRowLoading = loadingSimId === rowId;
                const displayName = item.simulation_id ?? t("Simulation");
                const countryName = item.country_name ?? item.country ?? "";
                const createdAt = item.created_at
                  ? new Date(item.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "";
                return (
                  <div
                    key={rowId}
                    className="mx-3 mt-3 bg-white"
                    style={{
                      borderRadius: 16,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                      cursor: loadingSimId !== null ? "not-allowed" : "pointer",
                      opacity: loadingSimId !== null && !isRowLoading ? 0.6 : 1,
                    }}
                    onClick={() =>
                      !loadingSimId && loadSimulation(item.report_id ?? item.simulation_id ?? "")
                    }
                  >
                    <div className="flex items-center" style={{ paddingBottom: 10 }}>
                      {/* Left: text fields */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-bold"
                          style={{
                            color: COLORS.raisinBlack,
                            fontSize: 18,
                            margin: "10px 10px 0 10px",
                          }}
                        >
                          {displayName}
                        </p>
                        <div
                          className="flex items-center"
                          style={{ marginTop: 10, marginLeft: 10 }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            fill="none"
                            style={{ flexShrink: 0, marginRight: 6 }}
                          >
                            <rect
                              x="2"
                              y="1.5"
                              width="10"
                              height="11"
                              rx="1.5"
                              stroke={COLORS.darkSilver}
                              strokeWidth="1.2"
                            />
                            <path
                              d="M4 5h6M4 7h5M4 9h3.5"
                              stroke={COLORS.darkSilver}
                              strokeWidth="1.2"
                              strokeLinecap="round"
                            />
                          </svg>
                          <span
                            style={{
                              color: COLORS.darkSilver,
                              fontSize: 13,
                            }}
                          >
                            {t("ID: ")}
                            {rowId}
                          </span>
                        </div>
                        {countryName && (
                          <div
                            className="flex items-center"
                            style={{ marginTop: 10, marginLeft: 10 }}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 14 14"
                              fill="none"
                              style={{ flexShrink: 0, marginRight: 6 }}
                            >
                              <path
                                d="M7 1.5A3.5 3.5 0 0 0 3.5 5c0 2.625 3.5 7 3.5 7S10.5 7.625 10.5 5A3.5 3.5 0 0 0 7 1.5zm0 4.75A1.25 1.25 0 1 1 7 4a1.25 1.25 0 0 1 0 2.25z"
                                fill={COLORS.darkSilver}
                              />
                            </svg>
                            <span
                              style={{
                                color: COLORS.darkSilver,
                                fontSize: 13,
                              }}
                            >
                              {t("Country: ")}
                              {countryName}
                            </span>
                          </div>
                        )}
                        {createdAt && (
                          <div
                            className="flex items-center"
                            style={{ marginTop: 10, marginLeft: 10 }}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 14 14"
                              fill="none"
                              style={{ flexShrink: 0, marginRight: 6 }}
                            >
                              <rect
                                x="1.5"
                                y="2.5"
                                width="11"
                                height="10"
                                rx="1.5"
                                stroke={COLORS.darkSilver}
                                strokeWidth="1.2"
                              />
                              <path
                                d="M4.5 1.5v2M9.5 1.5v2M1.5 5.5h11"
                                stroke={COLORS.darkSilver}
                                strokeWidth="1.2"
                                strokeLinecap="round"
                              />
                            </svg>
                            <span
                              style={{
                                color: COLORS.darkSilver,
                                fontSize: 13,
                              }}
                            >
                              {t("Created on: ")}
                              {createdAt}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Right: arrow pill card */}
                      <div
                        className="flex items-center justify-center flex-shrink-0"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 60,
                          backgroundColor: COLORS.brightGrayNew,
                          marginRight: 10,
                        }}
                      >
                        {isRowLoading ? (
                          <svg
                            className="animate-spin"
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <circle
                              cx="8"
                              cy="8"
                              r="6"
                              stroke={COLORS.webDivider}
                              strokeWidth="2"
                            />
                            <path
                              d="M8 2a6 6 0 0 1 6 6"
                              stroke={COLORS.darkAquamarineGreen}
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                              d="M6 4L10 8L6 12"
                              stroke={COLORS.darkAquamarineGreen}
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

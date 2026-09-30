"use client";

// Feed Row's edit / add-custom-feed dialog (Android DialogFeedDetails); split out of FeedRow.tsx (audit B-17).
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import Spinner from "@/components/ui/Spinner";
import { COLORS } from "@/lib/colors";
import { nutrientFieldsFor } from "@/lib/nutrients";

import type { NutrientKey } from "@/lib/nutrients";
import type { FeedItem } from "@/lib/api-client/models";
import type React from "react";

export interface FeedEditDialogProps {
  editFeedDetailsExpanded: boolean;
  editFeedName: string;
  editForm: Record<NutrientKey, string>;
  editIsInsert: boolean;
  editNamePrefix: string;
  editNutritionalInfoExpanded: boolean;
  handleEditSubmit: () => Promise<void>;
  isLoadingEdit: boolean;
  isSavingEdit: boolean;
  item: FeedItem;
  setEditFeedDetailsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setEditFeedName: React.Dispatch<React.SetStateAction<string>>;
  setEditForm: React.Dispatch<React.SetStateAction<Record<NutrientKey, string>>>;
  setEditNutritionalInfoExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setShowEditModal: React.Dispatch<React.SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function FeedEditDialog({
  editFeedDetailsExpanded,
  editFeedName,
  editForm,
  editIsInsert,
  editNamePrefix,
  editNutritionalInfoExpanded,
  handleEditSubmit,
  isLoadingEdit,
  isSavingEdit,
  item,
  setEditFeedDetailsExpanded,
  setEditFeedName,
  setEditForm,
  setEditNutritionalInfoExpanded,
  setShowEditModal,
  t,
}: FeedEditDialogProps) {
  return (() => {
    const fields = nutrientFieldsFor(item.category_name);
    const title = editIsInsert ? t("Add Custom Feed") : t("Edit Nutritional Information");
    const submitReady = !isSavingEdit && !isLoadingEdit && editFeedName.trim() !== "";
    return (
      <div
        className="fixed top-0 h-full z-50 flex flex-col justify-end"
        style={{
          left: COLUMN_LEFT,
          width: COLUMN_WIDTH,
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSavingEdit) setShowEditModal(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="bg-white rounded-t-2xl px-5 pt-5 pb-8 overflow-y-auto"
          style={{ maxHeight: "90vh", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
        >
          {/* Drag handle (Android view_drag_handle) */}
          <div className="flex justify-center mb-3">
            <div
              style={{
                width: 40,
                height: 6,
                borderRadius: 3,
                backgroundColor: COLORS.goGreen15,
              }}
            />
          </div>

          {/* Title with close button */}
          <div className="relative mb-4">
            <h3
              className="text-center font-bold"
              style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
            >
              {title}
            </h3>
            <button
              onClick={() => !isSavingEdit && setShowEditModal(false)}
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              aria-label={t("Close")}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M5 5L15 15M15 5L5 15"
                  stroke={COLORS.darkSilver}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Separator line below title */}
          <div className="mb-4" style={{ height: 1, backgroundColor: COLORS.webDivider }} />

          {isLoadingEdit ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="3"
                  strokeDasharray="40"
                  strokeDashoffset="10"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          ) : (
            <>
              {/* Feed Details collapsible section — minus when expanded, plus when collapsed */}
              <button
                onClick={() => setEditFeedDetailsExpanded((p) => !p)}
                className="w-full flex items-center justify-between mb-3"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                <span
                  className="font-bold"
                  style={{ color: COLORS.darkAquamarineGreen, fontSize: 16 }}
                >
                  {t("Feed Details")}
                </span>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M3 9h12"
                    stroke={COLORS.darkAquamarineGreen}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {!editFeedDetailsExpanded && (
                    <path
                      d="M9 3v12"
                      stroke={COLORS.darkAquamarineGreen}
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </button>

              {editFeedDetailsExpanded && (
                <>
                  {/* Feed Type — read-only. Only the LABEL above is UI chrome
                    (translated); the value itself is the feed-identity
                    string, which has its own separate taxonomyLabels/display
                    system — left untouched here per that system's ownership. */}
                  <p
                    className="text-xs font-bold uppercase mb-1"
                    style={{ color: COLORS.darkSilver }}
                  >
                    {t("Feed Type")}
                  </p>
                  <div
                    className="rounded-xl px-4 py-3 text-sm mb-3"
                    style={{
                      backgroundColor: COLORS.brightGray,
                      color: COLORS.raisinBlack,
                    }}
                  >
                    {item.feed_type_name || "—"}
                  </div>

                  {/* Feed Category — read-only (see note above) */}
                  <p
                    className="text-xs font-bold uppercase mb-1"
                    style={{ color: COLORS.darkSilver }}
                  >
                    {t("Feed Category")}
                  </p>
                  <div
                    className="rounded-xl px-4 py-3 text-sm mb-3"
                    style={{
                      backgroundColor: COLORS.brightGray,
                      color: COLORS.raisinBlack,
                    }}
                  >
                    {item.category_name || "—"}
                  </div>

                  {/* Feed Name — prefix + editable suffix (or fully disabled when
                    isInsert=false and the original name already contains "-"). */}
                  <p
                    className="text-xs font-bold uppercase mb-1"
                    style={{ color: COLORS.darkSilver }}
                  >
                    {t("Feed Name")}
                    <span style={{ color: COLORS.redRyb }}> *</span>
                  </p>
                  <div
                    className="flex items-center rounded-xl mb-4"
                    style={{
                      backgroundColor: editIsInsert ? COLORS.americanDiamond : COLORS.brightGray,
                    }}
                  >
                    {editNamePrefix && (
                      <span className="pl-4 pr-1 text-sm" style={{ color: COLORS.darkSilver }}>
                        {editNamePrefix}
                      </span>
                    )}
                    <input
                      aria-label={t("Feed Name")}
                      type="text"
                      value={editFeedName}
                      onChange={(e) =>
                        setEditFeedName(e.target.value.replace(/[^a-zA-Z0-9\s]/g, ""))
                      }
                      disabled={!editIsInsert}
                      className="flex-1 bg-transparent px-3 py-3 text-sm border-none focus:outline-none"
                      style={{
                        color: COLORS.raisinBlack,
                        cursor: !editIsInsert ? "not-allowed" : "text",
                      }}
                    />
                  </div>
                </>
              )}

              {/* Nutritional Information collapsible section — minus when expanded, plus when collapsed */}
              <button
                onClick={() => setEditNutritionalInfoExpanded((p) => !p)}
                className="w-full flex items-center justify-between mb-3"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                <span
                  className="font-bold"
                  style={{ color: COLORS.darkAquamarineGreen, fontSize: 16 }}
                >
                  {t("Nutritional Information")}
                </span>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M3 9h12"
                    stroke={COLORS.darkAquamarineGreen}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {!editNutritionalInfoExpanded && (
                    <path
                      d="M9 3v12"
                      stroke={COLORS.darkAquamarineGreen}
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </button>

              {editNutritionalInfoExpanded && (
                <>
                  <p className="text-xs mb-3" style={{ color: COLORS.darkSilver }}>
                    {t("Nutrient Composition (%)")}
                  </p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {fields.map((f) => (
                      <div key={f.key}>
                        <p
                          className="text-xs font-bold uppercase mb-1"
                          style={{ color: COLORS.darkSilver }}
                        >
                          {t(f.label)}
                        </p>
                        <input
                          aria-label={t(f.label)}
                          type="number"
                          inputMode="decimal"
                          value={editForm[f.key]}
                          onChange={(e) => setEditForm((p) => ({ ...p, [f.key]: e.target.value }))}
                          placeholder="0.00"
                          className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                          style={{
                            backgroundColor: COLORS.americanDiamond,
                            color: COLORS.raisinBlack,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              <button
                onClick={handleEditSubmit}
                disabled={!submitReady}
                className="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center"
                style={{
                  backgroundColor: submitReady ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
                  color: submitReady ? "white" : "#999",
                  border: "none",
                  cursor: submitReady ? "pointer" : "not-allowed",
                }}
              >
                {isSavingEdit ? <Spinner size={20} /> : t("Submit")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  })();
}

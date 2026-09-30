"use client";

// "Custom Feed" bottom sheet on Feed Selection (Android DialogAddCustomFeed):
// Feed Details (name / type / category) + Nutritional Information, laid out
// per category (lib/nutrients.ts). Split out of feed-selection/page.tsx
// (audit B-17); the page owns the state and the save handler.
import { useId } from "react";
import type { Dispatch, SetStateAction } from "react";
import CustomSelect from "@/components/CustomSelect";
import Spinner from "@/components/ui/Spinner";
import { COLORS } from "@/lib/colors";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { nutrientFieldsFor } from "@/lib/nutrients";

export const EMPTY_CUSTOM = {
  feed_type: "",
  feed_category: "",
  feed_name: "",
  fd_dm: "", // Dry Matter
  fd_ash: "", // Ash
  fd_cp: "", // Crude Protein
  fd_npn_cp: "", // NPN (Additive only)
  fd_ee: "", // Ether Extract
  fd_st: "", // Starch
  fd_ndf: "", // NDF
  fd_adf: "", // ADF
  fd_lg: "", // Lignin
  fd_ndin: "", // NDIN
  fd_adin: "", // ADIN
  fd_ca: "", // Calcium
  fd_p: "", // Phosphorus
};

export type CustomFeedForm = typeof EMPTY_CUSTOM;

function CustomFeedNutrientInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-bold uppercase mb-1"
        style={{ color: COLORS.darkSilver }}
      >
        {label}
      </label>
      <input
        id={id}
        aria-label={label}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
        style={{ backgroundColor: COLORS.americanDiamond, color: COLORS.raisinBlack }}
      />
    </div>
  );
}

export interface CustomFeedSheetProps {
  customFeedForm: CustomFeedForm;
  setCustomFeedForm: Dispatch<SetStateAction<CustomFeedForm>>;
  customFeedTypes: string[];
  customFeedCategories: string[];
  loadingCustomTypes: boolean;
  loadingCustomCats: boolean;
  handleCustomTypeChange: (feedType: string) => void | Promise<void>;
  handleSaveCustomFeed: () => void | Promise<void>;
  isSavingCustom: boolean;
  feedDetailsExpanded: boolean;
  setFeedDetailsExpanded: Dispatch<SetStateAction<boolean>>;
  nutritionalInfoExpanded: boolean;
  setNutritionalInfoExpanded: Dispatch<SetStateAction<boolean>>;
  setShowCustomFeedModal: (open: boolean) => void;
  user: { name?: string; country_id?: string } | null;
  t: (source: string) => string;
}

export default function CustomFeedSheet({
  customFeedCategories,
  customFeedForm,
  customFeedTypes,
  feedDetailsExpanded,
  handleCustomTypeChange,
  handleSaveCustomFeed,
  isSavingCustom,
  loadingCustomCats,
  loadingCustomTypes,
  nutritionalInfoExpanded,
  setCustomFeedForm,
  setFeedDetailsExpanded,
  setNutritionalInfoExpanded,
  setShowCustomFeedModal,
  t,
  user,
}: CustomFeedSheetProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex flex-col justify-end"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.45)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowCustomFeedModal(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-t-2xl px-5 pt-5 pb-8 overflow-y-auto"
        style={{ maxHeight: "90vh", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
      >
        {/* Drag handle (matches Android view_drag_handle) */}
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

        {/* Title — matches Android DialogFeedDetails tv_title:
            "Add Custom Feed" for isAdd=true, "Edit Nutritional Information"
            for isAdd=false. Centered, bold, 20sp, dark_aquamarine_green. */}
        <div className="relative mb-4">
          <h3
            className="text-center font-bold"
            style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
          >
            {t("Add Custom Feed")}
          </h3>
          <button
            onClick={() => setShowCustomFeedModal(false)}
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

        {/* Separator line below title (matches Android view_separator_feed_details) */}
        <div className="mb-4" style={{ height: 1, backgroundColor: COLORS.webDivider }} />

        {/* "Feed Details" expand/collapse header (matches Android cvExpandFeedDetails).
            Icon mirrors Android drawables: minus when expanded, plus when collapsed. */}
        <button
          onClick={() => setFeedDetailsExpanded((p) => !p)}
          className="w-full flex items-center justify-between mb-3"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
        >
          <span className="font-bold" style={{ color: COLORS.darkAquamarineGreen, fontSize: 16 }}>
            {t("Feed Details")}
          </span>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M3 9h12"
              stroke={COLORS.darkAquamarineGreen}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {!feedDetailsExpanded && (
              <path
                d="M9 3v12"
                stroke={COLORS.darkAquamarineGreen}
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>

        {feedDetailsExpanded && (
          <>
            {/* Feed Type — first required field (no Country in Android end-user UI) */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: COLORS.darkSilver }}>
              {t("Feed Type")}
              <span style={{ color: COLORS.redRyb }}> *</span>
            </p>
            <div className="relative mb-3">
              {loadingCustomTypes ? (
                <div className="h-11 rounded-xl shimmer" />
              ) : (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: COLORS.americanDiamond,
                    opacity: !user?.country_id ? 0.6 : 1,
                  }}
                >
                  <CustomSelect
                    transparentTrigger
                    value={customFeedForm.feed_type}
                    onChange={handleCustomTypeChange}
                    disabled={!user?.country_id}
                    placeholder={t("Select feed type")}
                    options={customFeedTypes.map((ft) => ({ value: ft, label: ft }))}
                  />
                </div>
              )}
            </div>

            {/* Feed Category — gated on feed type */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: COLORS.darkSilver }}>
              {t("Feed Category")}
              <span style={{ color: COLORS.redRyb }}> *</span>
            </p>
            <div className="relative mb-3">
              {loadingCustomCats ? (
                <div className="h-11 rounded-xl shimmer" />
              ) : (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: !customFeedForm.feed_type
                      ? COLORS.brightGray
                      : COLORS.americanDiamond,
                    opacity: !customFeedForm.feed_type ? 0.6 : 1,
                  }}
                >
                  <CustomSelect
                    transparentTrigger
                    value={customFeedForm.feed_category}
                    onChange={(v) => setCustomFeedForm((p) => ({ ...p, feed_category: v }))}
                    disabled={!customFeedForm.feed_type}
                    placeholder={
                      !customFeedForm.feed_type ? t("Select type first") : t("Select category")
                    }
                    options={customFeedCategories.map((c) => ({ value: c, label: c }))}
                  />
                </div>
              )}
            </div>

            {/* Feed Name — gated on category. Android DialogFeedDetails
            also shows a user-name prefix (e.g. "John-") via
            PrefsManager.getUserNamePrefix(). We render the same. */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: COLORS.darkSilver }}>
              {t("Feed Name")}
              <span style={{ color: COLORS.redRyb }}> *</span>
            </p>
            <div
              className="flex items-center rounded-xl mb-4"
              style={{
                backgroundColor: !customFeedForm.feed_category
                  ? COLORS.brightGray
                  : COLORS.americanDiamond,
                opacity: !customFeedForm.feed_category ? 0.6 : 1,
              }}
            >
              <span className="pl-4 pr-1 text-sm" style={{ color: COLORS.darkSilver }}>
                {user?.name ? `${user.name.split(" ")[0]}-` : ""}
              </span>
              <input
                aria-label={t("Feed Name")}
                type="text"
                value={customFeedForm.feed_name}
                onChange={(e) => setCustomFeedForm((p) => ({ ...p, feed_name: e.target.value }))}
                disabled={!customFeedForm.feed_category}
                className="flex-1 bg-transparent px-1 py-3 text-sm border-none focus:outline-none"
                style={{
                  color: COLORS.raisinBlack,
                  cursor: !customFeedForm.feed_category ? "not-allowed" : "text",
                }}
              />
            </div>
          </>
        )}

        {/* "Nutritional Information" expand/collapse header
            (matches Android cvExpandNutritionalInformation).
            Icon mirrors Android drawables: minus when expanded, plus when collapsed. */}
        <button
          onClick={() => setNutritionalInfoExpanded((p) => !p)}
          className="w-full flex items-center justify-between mb-3"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
        >
          <span className="font-bold" style={{ color: COLORS.darkAquamarineGreen, fontSize: 16 }}>
            {t("Nutritional Information")}
          </span>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M3 9h12"
              stroke={COLORS.darkAquamarineGreen}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {!nutritionalInfoExpanded && (
              <path
                d="M9 3v12"
                stroke={COLORS.darkAquamarineGreen}
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>

        {nutritionalInfoExpanded &&
          (() => {
            // Match Android DialogFeedDetails: layout is chosen by feedCategory.
            // Before category is selected, default to General (matches Android
            // initUi where layoutNutrientInfoGeneral.root.visibility = VISIBLE).
            const fields = nutrientFieldsFor(customFeedForm.feed_category);
            return (
              <>
                <p className="text-xs mb-3" style={{ color: COLORS.darkSilver }}>
                  {t("Nutrient Composition (%)")}
                </p>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {fields.map((f) => (
                    <CustomFeedNutrientInput
                      key={f.key}
                      label={t(f.label)}
                      value={customFeedForm[f.key]}
                      onChange={(v) => setCustomFeedForm((p) => ({ ...p, [f.key]: v }))}
                    />
                  ))}
                </div>
              </>
            );
          })()}

        {/* Submit — Android btn_submit. Disabled (light_gray_new bg +
            spanish_gray text) until ALL four required fields are filled. */}
        {(() => {
          const ready =
            !!user?.country_id &&
            !!customFeedForm.feed_type &&
            !!customFeedForm.feed_category &&
            customFeedForm.feed_name.trim() !== "" &&
            !isSavingCustom;
          return (
            <button
              onClick={handleSaveCustomFeed}
              disabled={!ready}
              className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
              style={{
                backgroundColor: ready ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
                color: ready ? COLORS.white : COLORS.spanishGray,
                border: "none",
                cursor: ready ? "pointer" : "not-allowed",
              }}
            >
              {isSavingCustom ? <Spinner size={22} /> : t("Submit")}
            </button>
          );
        })()}
      </div>
    </div>
  );
}

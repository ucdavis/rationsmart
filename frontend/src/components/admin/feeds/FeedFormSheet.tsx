"use client";

// Add / edit feed sheet (Admin > Feed Management); split out of admin/feeds/page.tsx (audit B-17).
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import Spinner from "@/components/ui/Spinner";
import { COLORS } from "@/lib/colors";
import { NutrientInput } from "@/components/admin/feeds/shared";

import type {
  AdminFeed,
  AdminFeedCategory,
  AdminFeedType,
  Country,
  FeedForm,
} from "@/components/admin/feeds/shared";
import type React from "react";

export interface FeedFormSheetProps {
  countries: Country[];
  editingFeed: AdminFeed | null;
  feedCategories: AdminFeedCategory[];
  feedForm: FeedForm;
  feedTypes: AdminFeedType[];
  getCatName: (c: AdminFeedCategory) => string;
  getFeedTypeName: (c: AdminFeedCategory) => string;
  getName: (t: AdminFeedType) => string;
  handleSaveFeed: () => Promise<void>;
  isFeedFormValid: boolean;
  isSavingFeed: boolean;
  setFeedForm: React.Dispatch<React.SetStateAction<FeedForm>>;
  setShowFeedModal: React.Dispatch<React.SetStateAction<boolean>>;
  t: (source: string) => string;
}

export default function FeedFormSheet({
  countries,
  editingFeed,
  feedCategories,
  feedForm,
  feedTypes,
  getCatName,
  getFeedTypeName,
  getName,
  handleSaveFeed,
  isFeedFormValid,
  isSavingFeed,
  setFeedForm,
  setShowFeedModal,
  t,
}: FeedFormSheetProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex flex-col justify-end"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowFeedModal(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-t-2xl px-4 pt-5 pb-8 overflow-y-auto"
        style={{ maxHeight: "92vh", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
      >
        {/* Header — Android dialog_add_feed: centered "Add Feed" bold green
                font_20. dialog_edit_feed: left-aligned "Edit Feed" regular font_16. */}
        {editingFeed ? (
          <div className="flex items-center justify-between mb-5">
            <h3
              style={{
                color: COLORS.raisinBlack,
                fontSize: 16,
                fontWeight: 400,
              }}
            >
              {t("Edit Feed")}
            </h3>
            <button
              onClick={() => setShowFeedModal(false)}
              style={{ background: "none", border: "none", cursor: "pointer" }}
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
        ) : (
          <div className="relative mb-5">
            <h3
              className="text-center font-bold"
              style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
            >
              {t("Add Feed")}
            </h3>
            <button
              onClick={() => setShowFeedModal(false)}
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
        )}

        {/* Base fields — in EDIT mode all four are read-only (bright_gray
                bg, no border). In ADD mode they cascade: country → type →
                category → name (each disabled until the previous is picked). */}
        {(() => {
          const isEdit = !!editingFeed;
          const inputStyle = (disabled: boolean) =>
            ({
              backgroundColor: disabled ? COLORS.brightGray : COLORS.americanDiamond,
              color: COLORS.raisinBlack,
              borderRadius: 16,
              padding: "12px 14px",
              fontSize: 14,
              border: "none",
              width: "100%",
              opacity: disabled ? 0.85 : 1,
              cursor: disabled ? "not-allowed" : "auto",
            }) as const;

          return (
            <div className="space-y-3 mb-4">
              {/* COUNTRY * */}
              <div>
                <p
                  className="font-bold uppercase mb-1"
                  style={{ color: COLORS.darkSilver, fontSize: 12 }}
                >
                  {t("Country")}
                  <span style={{ color: COLORS.redRyb }}> *</span>
                </p>
                {isEdit ? (
                  <div style={inputStyle(true)}>{feedForm.fd_country_name || t("N/A")}</div>
                ) : (
                  <div className="relative">
                    <select
                      value={feedForm.fd_country_name}
                      onChange={(e) => {
                        const c = countries.find((x) => x.name === e.target.value);
                        setFeedForm((p) => ({
                          ...p,
                          fd_country_name: e.target.value,
                          fd_country_cd: c?.country_code ?? "",
                          fd_country_id: String(c?.id ?? ""),
                          fd_type: "",
                          fd_category: "",
                          fd_name: "",
                        }));
                      }}
                      className="appearance-none focus:outline-none pr-8"
                      style={{
                        ...inputStyle(false),
                        color: feedForm.fd_country_name ? COLORS.raisinBlack : "#999",
                      }}
                    >
                      <option value="">{t("Select country")}</option>
                      {countries.map((c) => (
                        <option key={String(c.id)} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 5L7 9L11 5"
                          stroke={COLORS.darkSilver}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* FEED TYPE * — disabled until country selected (Add only) */}
              <div>
                <p
                  className="font-bold uppercase mb-1"
                  style={{ color: COLORS.darkSilver, fontSize: 12 }}
                >
                  {t("Feed Type")}
                  <span style={{ color: COLORS.redRyb }}> *</span>
                </p>
                {isEdit ? (
                  <div style={inputStyle(true)}>{feedForm.fd_type || t("N/A")}</div>
                ) : (
                  <div className="relative">
                    <select
                      value={feedForm.fd_type}
                      disabled={!feedForm.fd_country_name}
                      onChange={(e) =>
                        setFeedForm((p) => ({
                          ...p,
                          fd_type: e.target.value,
                          fd_category: "",
                          fd_name: "",
                        }))
                      }
                      className="appearance-none focus:outline-none pr-8"
                      style={{
                        ...inputStyle(!feedForm.fd_country_name),
                        color: feedForm.fd_type ? COLORS.raisinBlack : "#999",
                      }}
                    >
                      <option value="">
                        {!feedForm.fd_country_name ? t("Select country first") : t("Select type")}
                      </option>
                      {feedTypes.map((ft) => (
                        <option key={ft.id} value={getName(ft)}>
                          {getName(ft)}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 5L7 9L11 5"
                          stroke={COLORS.darkSilver}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* FEED CATEGORY * — disabled until type selected (Add only) */}
              <div>
                <p
                  className="font-bold uppercase mb-1"
                  style={{ color: COLORS.darkSilver, fontSize: 12 }}
                >
                  {t("Feed Category")}
                  <span style={{ color: COLORS.redRyb }}> *</span>
                </p>
                {isEdit ? (
                  <div style={inputStyle(true)}>{feedForm.fd_category || t("N/A")}</div>
                ) : (
                  <div className="relative">
                    <select
                      value={feedForm.fd_category}
                      disabled={!feedForm.fd_type}
                      onChange={(e) =>
                        setFeedForm((p) => ({ ...p, fd_category: e.target.value, fd_name: "" }))
                      }
                      className="appearance-none focus:outline-none pr-8"
                      style={{
                        ...inputStyle(!feedForm.fd_type),
                        color: feedForm.fd_category ? COLORS.raisinBlack : "#999",
                      }}
                    >
                      <option value="">
                        {!feedForm.fd_type ? t("Select type first") : t("Select category")}
                      </option>
                      {feedCategories
                        .filter(
                          (fc) => !feedForm.fd_type || getFeedTypeName(fc) === feedForm.fd_type
                        )
                        .map((fc) => (
                          <option key={fc.id} value={getCatName(fc)}>
                            {getCatName(fc)}
                          </option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 5L7 9L11 5"
                          stroke={COLORS.darkSilver}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* FEED NAME * — disabled until category selected (Add only) */}
              <div>
                <p
                  className="font-bold uppercase mb-1"
                  style={{ color: COLORS.darkSilver, fontSize: 12 }}
                >
                  {t("Feed Name")}
                  <span style={{ color: COLORS.redRyb }}> *</span>
                </p>
                {isEdit ? (
                  <div style={inputStyle(true)}>{feedForm.fd_name || t("N/A")}</div>
                ) : (
                  <input
                    aria-label={t("Feed Name")}
                    type="text"
                    value={feedForm.fd_name}
                    disabled={!feedForm.fd_category}
                    onChange={(e) => setFeedForm((p) => ({ ...p, fd_name: e.target.value }))}
                    placeholder={
                      !feedForm.fd_category ? t("Select category first") : t("e.g. Maize Silage")
                    }
                    className="focus:outline-none"
                    style={inputStyle(!feedForm.fd_category)}
                  />
                )}
              </div>
            </div>
          );
        })()}

        {/* Nutrient fields — 17 fields matching Android layout_nutrient_info.xml */}
        <p
          className="text-xs font-bold uppercase mb-3"
          style={{ color: COLORS.darkAquamarineGreen }}
        >
          {t("Nutrient Composition (%)")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NutrientInput
            label={t("Dry Matter (DM)")}
            value={feedForm.fd_dm}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_dm: v }))}
          />
          <NutrientInput
            label={t("Ash")}
            value={feedForm.fd_ash}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_ash: v }))}
          />
          <NutrientInput
            label={t("Cellulose")}
            value={feedForm.fd_cellulose}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_cellulose: v }))}
          />
          <NutrientInput
            label={t("Crude Fiber (CF)")}
            value={feedForm.fd_cf}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_cf: v }))}
          />
          <NutrientInput
            label={t("Crude Protein (CP)")}
            value={feedForm.fd_cp}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_cp: v }))}
          />
          <NutrientInput
            label={t("Ether Extract (EE)")}
            value={feedForm.fd_ee}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_ee: v }))}
          />
          <NutrientInput
            label={t("Hemicellulose")}
            value={feedForm.fd_hemicellulose}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_hemicellulose: v }))}
          />
          <NutrientInput
            label={t("Starch (ST)")}
            value={feedForm.fd_st}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_st: v }))}
          />
          <NutrientInput
            label={t("NDF")}
            value={feedForm.fd_ndf}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_ndf: v }))}
          />
          <NutrientInput
            label={t("ADF")}
            value={feedForm.fd_adf}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_adf: v }))}
          />
          <NutrientInput
            label={t("Lignin")}
            value={feedForm.fd_lg}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_lg: v }))}
          />
          <NutrientInput
            label={t("NDIN")}
            value={feedForm.fd_ndin}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_ndin: v }))}
          />
          <NutrientInput
            label={t("NFE")}
            value={feedForm.fd_nfe}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_nfe: v }))}
          />
          <NutrientInput
            label={t("NPN CP")}
            value={feedForm.fd_npn_cp}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_npn_cp: v }))}
          />
          <NutrientInput
            label={t("ADIN")}
            value={feedForm.fd_adin}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_adin: v }))}
          />
          <NutrientInput
            label={t("Calcium (Ca)")}
            value={feedForm.fd_ca}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_ca: v }))}
          />
          <NutrientInput
            label={t("Phosphorus (P)")}
            value={feedForm.fd_p}
            onChange={(v) => setFeedForm((p) => ({ ...p, fd_p: v }))}
          />
        </div>

        <button
          onClick={handleSaveFeed}
          disabled={!isFeedFormValid || isSavingFeed}
          className="w-full mt-5 py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
          style={{
            backgroundColor:
              isFeedFormValid && !isSavingFeed ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
            color: isFeedFormValid && !isSavingFeed ? "white" : "#999",
            border: "none",
            cursor: isFeedFormValid && !isSavingFeed ? "pointer" : "not-allowed",
          }}
        >
          {isSavingFeed ? <Spinner size={18} rounded={false} /> : t("Submit")}
        </button>
      </div>
    </div>
  );
}

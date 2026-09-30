"use client";

// Custom Diet Limits bottom sheet (Feed Selection). Rows come from the
// per-state spec (GET /v1/animal/diet-thresholds, CLAUDE.md §19.2); blank
// means "engine default". Split out of feed-selection/page.tsx (audit B-17);
// the page owns the state and passes it in.
import {
  DIET_LIMIT_LABELS,
  DIET_LIMIT_UNIT_LABELS,
  type DietLimits,
  type DietThresholdSpec,
} from "@/lib/api";
import { COLORS } from "@/lib/colors";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";

export interface DietLimitsSheetProps {
  limits: Partial<DietLimits>;
  limitSpecs: DietThresholdSpec[] | null;
  ndfFloorAboveCeiling: boolean;
  limitOutOfRange: (spec: DietThresholdSpec) => boolean;
  updateLimit: (key: keyof DietLimits, val: string) => void;
  setDietLimits: (limits: Partial<DietLimits>) => void;
  setShowLimitsModal: (open: boolean) => void;
  showSnackbar: (message: string, type?: "success" | "error" | "info") => void;
  t: (source: string) => string;
}

export default function DietLimitsSheet({
  limits,
  limitSpecs,
  ndfFloorAboveCeiling,
  limitOutOfRange,
  updateLimit,
  setDietLimits,
  setShowLimitsModal,
  showSnackbar,
  t,
}: DietLimitsSheetProps) {
  return (
    <div
      className="fixed top-0 h-full z-50 flex flex-col justify-end"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.45)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowLimitsModal(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-t-2xl px-5 pt-5 pb-8"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-base font-bold" style={{ color: COLORS.darkAquamarineGreen }}>
              {t("Custom Diet Limits")}
            </h3>
            {/* Blank is a first-class state, NOT zero: blank means "use
                this animal's engine default", and a typed 0 is rejected
                outright. Stated once here instead of on all eight rows. */}
            <p className="text-xs mt-1" style={{ color: COLORS.darkSilver }}>
              {t("Default value will be applied if left blank")}
            </p>
          </div>
          <button
            onClick={() => setShowLimitsModal(false)}
            style={{ background: "none", border: "none", cursor: "pointer" }}
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

        {/* Scrollable — eight limits don't fit a bottom sheet otherwise. */}
        <div style={{ maxHeight: "58vh", overflowY: "auto", marginRight: -4, paddingRight: 4 }}>
          {(limitSpecs ?? []).map((spec) => {
            const { key, min, max, unit } = spec;
            const val = limits[key];
            const outOfRange = limitOutOfRange(spec);
            const unitLabel = t(DIET_LIMIT_UNIT_LABELS[unit] ?? unit);
            // No TARGET / LIMIT badge. `enforcement: "soft"` rows used to
            // render as "Target" because QA had read a legitimate
            // overshoot as the engine ignoring the input — but on
            // 2026-09-22 Maria and Satish ruled that all eight ARE
            // limits and the hard/soft distinction is an engine detail
            // the user shouldn't have to reason about. `spec.enforcement`
            // is still read elsewhere; don't put the badge back.
            const ndfConflict = key === "ndf_for_min" && ndfFloorAboveCeiling;
            const invalid = outOfRange || ndfConflict;
            return (
              <div key={key} className="mb-4">
                <label
                  htmlFor={`diet-limit-${key}`}
                  className="block text-xs font-bold uppercase mb-2"
                  style={{ color: COLORS.raisinBlack }}
                >
                  {t(DIET_LIMIT_LABELS[key] ?? key)} ({unitLabel})
                </label>
                <input
                  id={`diet-limit-${key}`}
                  type="number"
                  inputMode="decimal"
                  aria-label={`${t(DIET_LIMIT_LABELS[key] ?? key)} (${unitLabel})`}
                  placeholder={String(spec.default)}
                  min={min}
                  max={max}
                  step="0.1"
                  value={val ?? ""}
                  onChange={(e) => updateLimit(key, e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                  style={{
                    backgroundColor: invalid ? COLORS.peachyPink : COLORS.americanDiamond,
                    color: COLORS.raisinBlack,
                  }}
                />
                <p
                  className="text-xs mt-1 ml-1"
                  style={{
                    color: invalid ? COLORS.carminePink : COLORS.darkSilver,
                  }}
                >
                  {ndfConflict
                    ? t("Forage NDF Min cannot exceed NDF Max")
                    : outOfRange
                      ? t("Value must be between ${min} and ${max}")
                          .replace("${min}", String(min))
                          .replace("${max}", String(max))
                      : // `default` is this animal's engine value and is
                        // also the tighten-only bound, so the hint doubles
                        // as an explanation of why the range stops there.
                        // The per-field "leave blank" wording moved to the
                        // one line under the sheet title (2026-09-22) —
                        // here the default is just stated in brackets.
                        t("Range ${min} – ${max} ${unit} (Default ${default})")
                          .replace("${min}", String(min))
                          .replace("${max}", String(max))
                          .replace("${unit}", unitLabel)
                          .replace("${default}", String(spec.default))}
                </p>
              </div>
            );
          })}
        </div>

        {/* Limits may only be tightened — say so once rather than on
            every row. The "leave blank" half of this sentence now lives
            under the sheet title. */}
        <p className="text-[11px] mb-3 mt-1 ml-1" style={{ color: COLORS.darkSilver }}>
          {t(
            "Limits can only be tightened, never loosened. Tightening a limit too far can return no diet at all."
          )}
        </p>

        {(() => {
          const specs = limitSpecs ?? [];
          const anyOutOfRange = specs.some(limitOutOfRange);
          const anyFilled = specs.some(({ key }) => limits[key] != null);
          const cantApply = anyOutOfRange || ndfFloorAboveCeiling || !anyFilled;
          return (
            <button
              onClick={() => {
                if (anyOutOfRange || ndfFloorAboveCeiling) {
                  showSnackbar(t("Please correct out-of-range values before applying"), "error");
                  return;
                }
                if (!anyFilled) {
                  showSnackbar(t("Enter at least one limit before applying"), "info");
                  return;
                }
                setDietLimits(limits);
                setShowLimitsModal(false);
              }}
              disabled={cantApply}
              className="w-full py-4 rounded-xl font-bold text-base mt-2"
              style={{
                backgroundColor: cantApply ? COLORS.lightGrayNew : COLORS.darkAquamarineGreen,
                color: cantApply ? COLORS.spanishGray : "white",
                border: "none",
                cursor: cantApply ? "not-allowed" : "pointer",
              }}
            >
              {t("Apply Limits")}
            </button>
          );
        })()}
      </div>
    </div>
  );
}

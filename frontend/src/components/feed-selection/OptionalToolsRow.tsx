"use client";

// Feed Selection — the "Optional" tools row: Custom Diet Limits and Custom
// Feed. Split out of feed-selection/page.tsx (audit B-17).

import { IcAddFeed, IcTune } from "@/components/Icons";
import { COLORS } from "@/lib/colors";

export interface OptionalToolsRowProps {
  /** False for a Baby Calf/Heifer, which has no editable limits. */
  limitsApplyToAnimal: boolean;
  limitsDisabled: boolean;
  isEvaluation: boolean;
  limitSpecsError: string | null;
  onOpenLimits: () => void;
  onOpenCustomFeed: () => void;
  t: (source: string) => string;
}

/* Optional tools row — these two are INDEPENDENT actions (each opens
      its own tool), NOT a mode choice. Previously they were an equal
      50/50 split with one filled + one outlined, which read as a
      "selected vs unselected" toggle — especially sitting right above the
      real Recommendation/Evaluation radio group. Now: same-weight soft
      chips, sized to content and left-aligned (not a full-width split),
      each with a decorative leading icon and a muted "Optional" caption,
      so they read as optional tools rather than a pick-one control.
      Icons are aria-hidden so each button's accessible name stays exactly
      "Custom Diet Limits" / "Custom Feed" (tests + i18n depend on it). */
export default function OptionalToolsRow({
  limitsApplyToAnimal,
  limitsDisabled,
  isEvaluation,
  limitSpecsError,
  onOpenLimits,
  onOpenCustomFeed,
  t,
}: OptionalToolsRowProps) {
  return (
    <div className="px-4 pt-4">
      <p
        className="text-[11px] font-bold uppercase tracking-wide mb-2 ml-1"
        style={{ color: COLORS.spanishGray }}
      >
        {t("Optional")}
      </p>
      <div className="flex flex-wrap gap-2">
        {/* Custom Diet Limits — white pill, mint icon-badge (SectionCard
            aesthetic). Greyed out in evaluation mode (no optimizer to
            constrain), while the per-state ranges are still loading, and
            when they couldn't be fetched at all. Not rendered AT ALL for a
            Baby Calf/Heifer, which has no editable limits. */}
        {limitsApplyToAnimal && (
          <button
            onClick={onOpenLimits}
            disabled={limitsDisabled}
            style={{
              fontWeight: 700,
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 16px 7px 7px",
              borderRadius: 999,
              backgroundColor: limitsDisabled ? COLORS.americanDiamond : COLORS.white,
              color: limitsDisabled ? COLORS.spanishGray : COLORS.darkAquamarineGreen,
              border: `1.5px solid ${limitsDisabled ? COLORS.webDivider : COLORS.gainsboro}`,
              boxShadow: limitsDisabled ? "none" : "0 1px 2px rgba(6,40,30,0.06)",
              cursor: limitsDisabled ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            <span
              aria-hidden="true"
              className="flex items-center justify-center"
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                backgroundColor: limitsDisabled ? COLORS.webBorder : COLORS.brightGrayNew,
                flexShrink: 0,
              }}
            >
              <IcTune
                size={17}
                color={limitsDisabled ? COLORS.spanishGray : COLORS.darkAquamarineGreen}
              />
            </span>
            {/* Label never changes — it's the button's accessible name and a
              translated string. Loading/unavailable is conveyed by the
              disabled state and the caption below. */}
            {t("Custom Diet Limits")}
          </button>
        )}
        {/* Custom Feed — same white-pill treatment, always enabled. */}
        <button
          onClick={onOpenCustomFeed}
          style={{
            fontWeight: 700,
            fontSize: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 16px 7px 7px",
            borderRadius: 999,
            backgroundColor: COLORS.white,
            color: COLORS.darkAquamarineGreen,
            border: `1.5px solid ${COLORS.gainsboro}`,
            boxShadow: "0 1px 2px rgba(6,40,30,0.06)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <span
            aria-hidden="true"
            className="flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              backgroundColor: COLORS.brightGrayNew,
              flexShrink: 0,
            }}
          >
            <IcAddFeed size={17} color={COLORS.darkAquamarineGreen} />
          </span>
          {t("Custom Feed")}
        </button>
      </div>
      {/* Say WHY the tool is unavailable instead of leaving a dead pill.
          Only shown for the fetch failure — evaluation mode already reads
          as "not applicable here" from the radio group right below. */}
      {limitsApplyToAnimal && !isEvaluation && limitSpecsError && (
        <p className="text-[11px] mt-1.5 ml-1" style={{ color: COLORS.darkSilver }}>
          {t("Diet limits unavailable — check your connection and reopen this screen.")}
        </p>
      )}
    </div>
  );
}

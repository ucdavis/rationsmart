// Presentational building blocks of the diet report (section cards, metric
// tiles, methane bars, status badge) and the report-context helper. Split out
// of report/page.tsx (audit B-17); each mirrors an Android report layout.
import { COLORS } from "@/lib/colors";
import type { AnimalCategory, ReportContextFlags } from "@/lib/api";

// Y3 §2.3 — frontend equivalent of the backend's build_report_context.
// Maps the animal's physiological state (cattleInfo.animal_category,
// which maps 1-to-1 with the backend's An_StatePhys field) to a set
// of booleans indicating which report sections to render. Once Maria
// ships a `report_context` block on the diet response, we'll prefer
// that and fall back to this helper for older responses.
export type ReportContext = Required<ReportContextFlags>;
export function buildReportContext(category?: AnimalCategory | string | null): ReportContext {
  const cat = (category ?? "").trim();
  const isLactating = cat === "Lactating Cow";
  const isCalf = cat === "Baby Calf/Heifer";
  return {
    showMilkProductionSection: isLactating,
    showMilkCostMarginCard: isLactating,
    showSolutionSummaryMilk: isLactating,
    showCalfMilkFeedingSection: isCalf,
    showMethaneIntensity: isLactating,
  };
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    Optimized: { bg: COLORS.goGreen, text: "#fff" },
    Optimised: { bg: COLORS.goGreen, text: "#fff" },
    "Not Optimized": { bg: COLORS.carminePink, text: "#fff" },
    "Not Feasible": { bg: COLORS.carminePink, text: "#fff" },
    Evaluation: { bg: COLORS.vividGamboge, text: "#fff" },
    Evaluated: { bg: COLORS.vividGamboge, text: "#fff" },
    ADVISORY: { bg: COLORS.vividGamboge, text: "#fff" },
    INFEASIBLE: { bg: COLORS.carminePink, text: "#fff" },
    OPTIMAL: { bg: COLORS.goGreen, text: "#fff" },
  };
  const colors = map[status] ?? { bg: COLORS.webDivider, text: COLORS.raisinBlack };
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  );
}

// Card header — matches Android layout_*_report cards: icon in a
// go_green_15 (rgba(5,188,109,0.15)) pill with a dark_aquamarine_green
// tinted icon (24dp inside 6dp content padding, corner 10), then title
// bold font_16 raisin_black to the right.
export function SCard({
  title,
  icon,
  footer,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mx-3 my-2 bg-white overflow-hidden"
      style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      {title && (
        <div className="flex items-center gap-2.5" style={{ padding: "10px 10px 14px" }}>
          {icon && (
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: COLORS.goGreen15, borderRadius: 10, padding: 6 }}
            >
              {icon}
            </div>
          )}
          <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 16 }}>
            {title}
          </p>
        </div>
      )}
      <div style={{ paddingInline: 10, paddingBottom: 10 }}>{children}</div>
      {footer}
    </div>
  );
}

// Label/value pair as used by layout_animal_characteristics_report:
// label = nunito_bold, font_12, dark_silver; value = nunito_bold,
// font_16, raisin_black.
export function LabelValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-bold uppercase" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
        {label}
      </p>
      <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 16, marginTop: 4 }}>
        {value}
      </p>
    </div>
  );
}

// Progress bar — Android LinearProgressIndicator with trackCornerRadius=6
// and small filled circles at both ends. Track is the same color as the
// indicator but at ~15% alpha. The dots draw at the actual progress
// position and at the right end.
export function MethaneBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 6,
        borderRadius: 6,
        backgroundColor: `${color}26`,
        marginTop: 6,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 6,
          backgroundColor: color,
          transition: "width 0.3s",
        }}
      />
      {/* Cap dot at end of fill */}
      <span
        style={{
          position: "absolute",
          left: `calc(${pct}% - 4px)`,
          top: -1,
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
      {/* Cap dot at right end of track */}
      <span
        style={{
          position: "absolute",
          right: -1,
          top: -1,
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
    </div>
  );
}

// Android MethaneUiRanges constants (utils/MethaneUiRanges.kt)
export const MAX_METHANE_PRODUCTION = 1000.0; // g/day
export const MAX_METHANE_YIELD = 100.0; // g/kg DMI
export const MAX_METHANE_INTENSITY = 100.0; // g/kg ECM
export const MAX_YM_PERCENT = 100.0; // %
export const calcPct = (v: number | string | null | undefined, max: number) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, (n / max) * 100);
};

export function MetricTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: COLORS.honeydew }}>
      <p className="text-xs font-bold" style={{ color: COLORS.darkSilver }}>
        {label}
      </p>
      <p className="text-lg font-bold mt-0.5" style={{ color: COLORS.darkAquamarineGreen }}>
        {value}
      </p>
      {unit && (
        <p className="text-xs" style={{ color: COLORS.darkSilver }}>
          {unit}
        </p>
      )}
    </div>
  );
}

export function BalanceRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
}) {
  if (value === null || value === undefined) return null;
  const isPositive = value >= 0;
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b last:border-0"
      style={{ borderColor: COLORS.americanDiamond }}
    >
      <span className="text-sm font-bold" style={{ color: COLORS.raisinBlack }}>
        {label}
      </span>
      <span
        className="text-sm font-bold"
        style={{ color: isPositive ? COLORS.goGreen : COLORS.carminePink }}
      >
        {isPositive ? "+" : ""}
        {Number(value).toFixed(3)} {unit}
      </span>
    </div>
  );
}

export function BulletList({ items, color }: { items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span
            className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm" style={{ color: COLORS.raisinBlack, lineHeight: 1.5 }}>
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TotalCostFooter({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ backgroundColor: COLORS.honeydew, paddingInline: 10, paddingBlock: 12 }}
    >
      <span className="text-xs font-bold" style={{ color: COLORS.darkAquamarineGreen }}>
        {label}
      </span>
      <span className="font-bold" style={{ color: COLORS.laSalleGreen, fontSize: 18 }}>
        {value}
      </span>
    </div>
  );
}

/** Colours + label for the Diet Status banner (driven by diet_rating). */
export type BannerTheme = {
  bg: string;
  stroke: string;
  iconBg: string;
  titleColor: string;
  bodyColor: string;
  statusText: string;
};

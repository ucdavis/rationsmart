"use client";

// N3 "Limits You Set": the feed-card Min / Max and custom diet limits that
// shaped this run, as in the PDF's section of the same name. Renders nothing
// when the backend sent no `user_limits` (none set, or a pre-PR #115 report).
import type { CSSProperties } from "react";
import { SCard } from "@/components/report/parts";
import { IcViolatedParameter } from "@/components/Icons";
import { COLORS } from "@/lib/colors";
import type { UserDietLimit, UserLimits } from "@/lib/api-client/models";

const DASH = "—";

const amount = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? DASH : n.toFixed(2);

// "max" → "≤ 3", "min" → "≥ 30"; "—" when the value is missing.
const bound = (direction: UserDietLimit["direction"], n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? DASH
    : `${direction === "min" ? "≥" : "≤"} ${n}`;

const headCell: CSSProperties = {
  color: COLORS.darkSilver,
  fontSize: 12,
  letterSpacing: 0.5,
};
const bodyCell: CSSProperties = { color: COLORS.raisinBlack, fontSize: 14 };
const COLS = "minmax(0,1.6fr) minmax(0,0.8fr) minmax(0,0.8fr) minmax(0,1fr)";

function Row({ cells, head }: { cells: string[]; head?: boolean }) {
  return (
    <div
      role="row"
      className="grid items-center py-3 px-2"
      style={{
        gridTemplateColumns: COLS,
        borderBottom: `1px solid ${head ? COLORS.webDivider : COLORS.americanDiamond}`,
      }}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          role={head ? "columnheader" : "cell"}
          className={`${head ? "font-bold uppercase" : i === 0 ? "font-bold" : ""} ${
            i === 0 ? "" : "text-center"
          }`}
          style={head ? headCell : bodyCell}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

export default function UserLimitsCard({
  userLimits,
  t,
}: {
  userLimits: UserLimits | null | undefined;
  t: (source: string) => string;
}) {
  const inclusion = userLimits?.inclusion_limits ?? [];
  const diet = userLimits?.diet_limits ?? [];
  if (inclusion.length === 0 && diet.length === 0) return null;

  return (
    <SCard title={t("Limits You Set")} icon={<IcViolatedParameter />}>
      {inclusion.length > 0 && (
        <div role="table" aria-label={t("Feed inclusion limits")} className="mb-2">
          <Row head cells={[t("Feed"), t("Min"), t("Max"), t("In diet (kg/day)")]} />
          {inclusion.map((row, i) => (
            <Row
              key={`${row.feed_id}-${i}`}
              cells={[
                row.display_name || row.feed_name,
                amount(row.min_kg_asfed),
                amount(row.max_kg_asfed),
                amount(row.result_kg_asfed),
              ]}
            />
          ))}
        </div>
      )}
      {diet.length > 0 && (
        <div role="table" aria-label={t("Custom Diet Limits")} className="mb-2">
          <Row head cells={[t("Parameter"), t("Your limit"), t("Default"), t("Unit")]} />
          {diet.map((row, i) => (
            <Row
              key={`${row.key}-${i}`}
              cells={[
                row.display_label || row.label,
                bound(row.direction, row.value),
                bound(row.direction, row.default),
                row.unit,
              ]}
            />
          ))}
        </div>
      )}
      <p className="px-2 pb-3" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
        {t("These limits were set by the user and shape the diet above.")}
      </p>
    </SCard>
  );
}

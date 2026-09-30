"use client";

// FeedRow field chrome — split out of FeedRow.tsx (audit B-17).

import { COLORS } from "@/lib/colors";

// Android Material OutlinedBox style:
// - White background, thin border (gray when empty, dark-green when selected).
// - Label sits ON the top border line at left, with a small white-bg cutout
//   that "interrupts" the border. The red asterisk follows the label.
export function FieldBox({
  label,
  hasValue,
  disabled,
  optional,
  loading = false,
  invalid = false,
  children,
}: {
  label: string;
  hasValue: boolean;
  disabled?: boolean;
  optional?: boolean;
  // Paints the outline + label red. Used by the inclusion-limit fields,
  // where a typed 0 is rejected by the backend and must be visible as an
  // error rather than quietly dropped.
  invalid?: boolean;
  // Same box (dimensions, border-radius, label cutout) shimmers in
  // place instead of being swapped for separate skeleton markup — see
  // the cattle-info page's identical pattern for the rationale.
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={loading ? "shimmer" : undefined}
      style={{
        backgroundColor: loading ? undefined : COLORS.white,
        borderRadius: 16,
        border: loading
          ? "1.5px solid transparent"
          : `1.5px solid ${invalid ? COLORS.carminePink : hasValue ? COLORS.darkAquamarineGreen : COLORS.gainsboro}`,
        padding: "16px 12px 12px",
        position: "relative",
        opacity: disabled && !loading ? 0.55 : 1,
        cursor: disabled || loading ? "not-allowed" : "auto",
        minHeight: 60,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* Label cutout on the border — hidden while loading since the
          shimmering box has no fixed background for it to blend into. */}
      {!loading && (
        <span
          style={{
            position: "absolute",
            top: -8,
            left: 12,
            backgroundColor: COLORS.white,
            padding: "0 6px",
            color: invalid
              ? COLORS.carminePink
              : hasValue
                ? COLORS.darkAquamarineGreen
                : COLORS.darkSilver,
            fontSize: 12,
          }}
        >
          {label}
          {!optional && <span style={{ color: COLORS.redRyb }}>{" *"}</span>}
        </span>
      )}
      {children}
    </div>
  );
}

export const innerInputStyle = {
  backgroundColor: "transparent",
  color: COLORS.raisinBlack,
  border: "none",
  width: "100%",
  fontSize: 14,
  padding: 0,
  outline: "none",
};

// Same pattern as cattle-info's loadingFieldProps: while the row's own
// cascade (loadingTypes/Cats/Subs) is in flight, Price/Quantity/Cost/
// Min-Max would otherwise show a restored row's REAL values immediately
// (they're only gated on item.feed_uuid, not on the cascade), which is
// the same "some fields ready, some loading" mix that was fixed on
// cattle-info and the Type/Category/Feed fields above. Spread onto a
// native <input> alongside its normal style: `{...cascadeLoadingProps(rowLoading, style)}`.
export function cascadeLoadingProps(
  loading: boolean,
  style: React.CSSProperties
): { style: React.CSSProperties; disabled?: boolean; tabIndex?: number } {
  if (!loading) return { style };
  return {
    style: { ...style, color: "transparent", caretColor: "transparent" },
    disabled: true,
    tabIndex: -1,
  };
}

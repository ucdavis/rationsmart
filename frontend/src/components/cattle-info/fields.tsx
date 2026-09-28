"use client";

// Cattle Info — split out of cattle-info/page.tsx (audit B-17).

import CustomSelect from "@/components/CustomSelect";
import { COLORS } from "@/lib/colors";

export const inputStyle = {
  backgroundColor: COLORS.americanDiamond,
  color: COLORS.raisinBlack,
};
export function FieldLabel({ children }: { children: React.ReactNode }) {
  const cls = "text-xs font-bold uppercase tracking-wide mt-3 mb-1.5 ml-1";
  const style = { color: COLORS.darkSilver };
  if (typeof children === "string" && children.endsWith(" *")) {
    return (
      <p className={cls} style={style}>
        {children.slice(0, -2)}
        <span style={{ color: COLORS.redRyb }}>{" *"}</span>
      </p>
    );
  }
  return (
    <p className={cls} style={style}>
      {children}
    </p>
  );
}
// UX: shimmer the REAL form fields in place while getCountries is in
// flight, rather than swapping in a separately-built skeleton tree. A
// hand-approximated skeleton can drift from the actual field layout
// (spacing, conditional error rows, section field counts) and causes a
// layout jump the moment it's replaced. Reusing the real elements
// guarantees byte-identical layout before/after — only the appearance
// (shimmer background, hidden value, disabled) changes.
// Spread onto a native <input>/<textarea> alongside its normal
// className/style: `{...loadingFieldProps(loadingCountries, className, style)}`.
export function loadingFieldProps(
  loading: boolean,
  className: string,
  style: React.CSSProperties
): { className: string; style: React.CSSProperties; disabled: boolean; tabIndex?: number } {
  if (!loading) return { className, style, disabled: false };
  return {
    className: `${className} shimmer`,
    style: { ...style, color: "transparent", caretColor: "transparent" },
    disabled: true,
    tabIndex: -1,
  };
}
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs mt-1 ml-1" style={{ color: COLORS.carminePink }}>
      {message}
    </p>
  );
}
// Amber ring + note on a value that was pulled into range on restore.
export const ADJUSTED_RING: React.CSSProperties = { boxShadow: `0 0 0 2px ${COLORS.vividGamboge}` };
export function AdjustedNote({ from, label }: { from?: string; label: string }) {
  if (from === undefined) return null;
  return (
    <p className="text-xs mt-1 ml-1" style={{ color: COLORS.vividGamboge }}>
      {label} {from}
    </p>
  );
}
export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  loading = false,
  highlight = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  highlight?: boolean;
}) {
  // Outer gray-pill keeps the rounded chrome consistent with other fields;
  // CustomSelect renders its own zebra-striped popup matching Android's
  // DropDownListAdapter (mint/white alternating rows).
  // `loading`: same outer box (className unchanged apart from appending
  // "shimmer", which only touches background/animation) with the SAME
  // CustomSelect underneath — text hidden, interaction disabled — rather
  // than swapping in different markup, so there's no layout drift
  // between the loading and loaded states.
  return (
    <div
      className={`rounded-2xl px-4 py-3${loading ? " shimmer" : ""}`}
      style={
        loading
          ? undefined
          : { ...inputStyle, opacity: disabled ? 0.55 : 1, ...(highlight ? ADJUSTED_RING : {}) }
      }
    >
      <CustomSelect
        transparentTrigger
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder ?? "Select"}
        disabled={disabled}
        loading={loading}
      />
    </div>
  );
}

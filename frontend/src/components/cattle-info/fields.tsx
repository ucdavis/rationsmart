"use client";

// Cattle Info — split out of cattle-info/page.tsx (audit B-17).

import CustomSelect from "@/components/CustomSelect";
import { COLORS } from "@/lib/colors";
import { useT, fillText } from "@/lib/i18n-ui";

export const inputStyle = {
  backgroundColor: COLORS.americanDiamond,
  color: COLORS.raisinBlack,
};
// A real <label> (audit B-31). Pass `htmlFor` for text / number inputs so
// tapping the label focuses the field. Leave it off for dropdowns: a label
// bound to CustomSelect's trigger button would REPLACE the button's
// accessible name (the selected value, e.g. "India") with the label text.
export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  const cls = "block text-xs font-bold uppercase tracking-wide mt-3 mb-1.5 ml-1";
  const style = { color: COLORS.darkSilver };
  if (typeof children === "string" && children.endsWith(" *")) {
    return (
      <label htmlFor={htmlFor} className={cls} style={style}>
        {children.slice(0, -2)}
        <span style={{ color: COLORS.redRyb }}>{" *"}</span>
      </label>
    );
  }
  return (
    <label htmlFor={htmlFor} className={cls} style={style}>
      {children}
    </label>
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
// `template` is the translated "Adjusted from ${value}" sentence.
export function AdjustedNote({ from, template }: { from?: string; template: string }) {
  if (from === undefined) return null;
  return (
    <p className="text-xs mt-1 ml-1" style={{ color: COLORS.vividGamboge }}>
      {fillText(template, { value: from })}
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
  const t = useT();
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
        placeholder={placeholder ?? t("Select")}
        disabled={disabled}
        loading={loading}
      />
    </div>
  );
}

// §1.2 Y3 grazing tooltip — shown below the Active Grazing row when "i" is
// tapped. Text is the exact copy from the Refinements Y3 doc.
export function GrazingInfoTooltip({
  onClose,
  t,
}: {
  onClose: () => void;
  t: (source: string) => string;
}) {
  return (
    <div
      role="tooltip"
      className="mt-2 px-4 py-3 flex gap-2.5"
      style={{
        backgroundColor: COLORS.white,
        border: "1px solid rgba(5,188,109,0.30)",
        borderRadius: 16,
        boxShadow: "0 4px 14px rgba(6,78,59,0.10)",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        style={{ flexShrink: 0, marginTop: 2 }}
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" fill={COLORS.darkAquamarineGreen} />
        <circle cx="12" cy="7.6" r="1.35" fill={COLORS.white} />
        <rect x="10.95" y="10.5" width="2.1" height="7" rx="1.05" fill={COLORS.white} />
      </svg>
      <p
        className="text-sm"
        style={{
          color: COLORS.raisinBlack,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {t(
          "Grazing activity increases energy requirements. If enabled, RationSmart adds an extra energy allowance based on topography and distance walked. Leave this off for housed animals."
        )}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("Close tooltip")}
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: "50%",
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: COLORS.darkSilver,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 3l8 8M11 3L3 11"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

// Topography radios (Flat / Hilly / Mountainous — options come from the spec).
// Disabled and greyed while grazing is OFF.
export function TopographyRadios({
  options,
  value,
  grazing,
  onPick,
  t,
}: {
  options: string[];
  value: string;
  grazing: boolean;
  onPick: (option: string) => void;
  t: (source: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 ml-1">
      <span
        className="text-xs font-bold uppercase tracking-wide"
        style={{ color: COLORS.darkSilver }}
      >
        {(() => {
          const label = t("Topography *");
          return label.endsWith(" *") ? label.slice(0, -2) : label;
        })()}
        <span style={{ color: COLORS.redRyb }}>{" *"}</span>
      </span>
      {options.map((opt) => {
        const selected = value === opt;
        const active = grazing && selected;
        return (
          <button
            key={opt}
            type="button"
            disabled={!grazing}
            onClick={() => onPick(opt)}
            className="flex items-center gap-2"
            style={{
              background: "none",
              border: "none",
              cursor: grazing ? "pointer" : "not-allowed",
              padding: 0,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: `2px solid ${active ? COLORS.darkAquamarineGreen : COLORS.webDivider}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {selected && (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: active ? COLORS.darkAquamarineGreen : COLORS.silverSand,
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: active ? 700 : 400,
                color: active ? COLORS.darkAquamarineGreen : COLORS.darkSilver,
              }}
            >
              {t(opt)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

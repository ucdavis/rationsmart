"use client";

import { useEffect, useRef, useState } from "react";

// Mirrors Android DropdownListAdapter.setTextBackgroundColor:
// position 0 → white (top-rounded), odd positions → bright_gray_new
// (#E4F7EF) light mint, even positions → white. The native <select>
// popup can't apply per-row backgrounds across browsers, so this
// component renders its own popup card with the exact zebra pattern.

export interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Inline render — chevron drawn inside the trigger. Default true. */
  showChevron?: boolean;
  /** Renders the trigger as transparent text (used inside FieldBox where
   * the parent supplies the outlined-box chrome). Default false. */
  transparentTrigger?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled,
  className,
  style,
  showChevron = true,
  transparentTrigger = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        popupRef.current && !popupRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder;

  // Android DropdownListAdapter background-color rules.
  const rowBg = (idx: number, last: number) => {
    if (idx === 0) return "#FFFFFF";
    if (idx === last) return idx % 2 === 0 ? "#FFFFFF" : "#E4F7EF";
    return idx % 2 === 0 ? "#FFFFFF" : "#E4F7EF";
  };
  const rowRadius = (idx: number, last: number) => {
    if (idx === 0 && idx === last) return "10px";
    if (idx === 0) return "10px 10px 0 0";
    if (idx === last) return "0 0 10px 10px";
    return "0";
  };

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        className="w-full flex items-center justify-between"
        style={{
          background: transparentTrigger ? "transparent" : undefined,
          border: "none",
          padding: 0,
          color: value ? "#231F20" : "#9CA3AF",
          fontFamily: "Nunito, sans-serif",
          fontSize: 14,
          cursor: disabled ? "not-allowed" : "pointer",
          width: "100%",
          textAlign: "left",
        }}
      >
        <span className="truncate" style={{ flex: 1, minWidth: 0, paddingRight: showChevron ? 8 : 0 }}>
          {displayLabel}
        </span>
        {showChevron && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}
          >
            <path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {open && options.length > 0 && (
        <div
          ref={popupRef}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            backgroundColor: "#FFFFFF",
            borderRadius: 10,
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            overflow: "hidden",
            zIndex: 60,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {options.map((opt, idx) => {
            const last = options.length - 1;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className="w-full text-left"
                style={{
                  backgroundColor: rowBg(idx, last),
                  borderRadius: rowRadius(idx, last),
                  border: "none",
                  padding: "10px 12px",
                  fontFamily: "Nunito, sans-serif",
                  fontSize: 14,
                  color: "#231F20",
                  cursor: "pointer",
                  display: "block",
                  width: "100%",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

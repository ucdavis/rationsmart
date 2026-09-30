"use client";

import { useEffect, useId, useRef, useState } from "react";
import { COLORS } from "@/lib/colors";

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
  /** Opt-in loading state: same trigger markup renders (no layout
   * change), but its label text goes transparent, the chevron hides,
   * and it's non-interactive — for callers who want to shimmer their
   * own wrapper (e.g. an outer pill background) around the SAME
   * element rather than swapping in separate skeleton markup. Default
   * false — existing callers are unaffected. */
  loading?: boolean;
  /** Shown inside the popup when `options` is empty, instead of the
   * popup silently not rendering at all — previously the trigger's
   * chevron would still flip open on click (no `options.length` guard
   * there) with nothing appearing underneath, which reads as "stuck" or
   * "broken" rather than "there's genuinely nothing to pick here" (e.g.
   * a Feed Type + Category combination with zero matching feeds).
   * Callers should pass an already-translated string. Defaults to
   * plain English since most callers don't have a category with zero
   * results often enough to warrant a translated default. */
  emptyLabel?: string;
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
  loading = false,
  emptyLabel = "No options available",
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  // Keyboard support (audit B-32): arrows move between options, Home/End
  // jump, Escape closes and returns focus to the trigger. Enter/Space on a
  // focused option is the native button click.
  const focusOption = (idx: number) => {
    const n = options.length;
    if (n === 0) return;
    optionRefs.current[((idx % n) + n) % n]?.focus();
  };
  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || loading) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const selectedIdx = options.findIndex((o) => o.value === value);
      // Focus once the popup has rendered.
      requestAnimationFrame(() =>
        focusOption(selectedIdx >= 0 ? selectedIdx : e.key === "ArrowUp" ? -1 : 0)
      );
    }
  };
  const onOptionKeyDown = (e: React.KeyboardEvent, idx: number) => {
    const moves: Partial<Record<string, number>> = {
      ArrowDown: idx + 1,
      ArrowUp: idx - 1,
      Home: 0,
      End: options.length - 1,
    };
    const target = moves[e.key];
    if (target !== undefined) {
      e.preventDefault();
      focusOption(target);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(t) &&
        popupRef.current &&
        !popupRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
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
    if (idx === 0) return COLORS.white;
    if (idx === last) return idx % 2 === 0 ? COLORS.white : COLORS.brightGrayNew;
    return idx % 2 === 0 ? COLORS.white : COLORS.brightGrayNew;
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
        onClick={() => !disabled && !loading && setOpen((p) => !p)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled || loading}
        tabIndex={loading ? -1 : undefined}
        className="w-full flex items-center justify-between"
        style={{
          background: transparentTrigger ? "transparent" : undefined,
          border: "none",
          padding: 0,
          color: loading ? "transparent" : value ? COLORS.raisinBlack : COLORS.darkSilver,
          fontSize: 14,
          cursor: loading ? "default" : disabled ? "not-allowed" : "pointer",
          width: "100%",
          textAlign: "left",
        }}
      >
        <span
          className="truncate"
          style={{ flex: 1, minWidth: 0, paddingRight: showChevron ? 8 : 0 }}
        >
          {displayLabel}
        </span>
        {showChevron && !loading && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{
              flexShrink: 0,
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 0.18s",
            }}
          >
            <path
              d="M3 5L7 9L11 5"
              stroke={COLORS.darkSilver}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {open && (
        <div
          ref={popupRef}
          id={listboxId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            backgroundColor: COLORS.white,
            borderRadius: 10,
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            overflow: "hidden",
            zIndex: 60,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {options.length === 0 && (
            <div
              style={{
                padding: "10px 12px",
                fontSize: 14,
                color: COLORS.spanishGray,
                borderRadius: 10,
              }}
            >
              {emptyLabel}
            </div>
          )}
          {options.map((opt, idx) => {
            const last = options.length - 1;
            return (
              <button
                key={opt.value}
                ref={(el) => {
                  optionRefs.current[idx] = el;
                }}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onKeyDown={(e) => onOptionKeyDown(e, idx)}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="w-full text-left"
                style={{
                  backgroundColor: rowBg(idx, last),
                  borderRadius: rowRadius(idx, last),
                  border: "none",
                  padding: "10px 12px",
                  fontSize: 14,
                  color: COLORS.raisinBlack,
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

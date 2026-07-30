"use client";

import { useRef, KeyboardEvent, ClipboardEvent } from "react";

interface PinInputProps {
  value: string;
  onChange: (val: string) => void;
  onComplete?: (val: string) => void;
  disabled?: boolean;
  /**
   * Number of digit boxes to render. Defaults to 6 for the v1 backend.
   * Set to 4 only when rendering the legacy "old PIN" field on the
   * /set-new-pin migration screen (where the user enters their existing
   * 4-digit PIN before choosing a new 6-digit one).
   */
  length?: number;
  /**
   * When true, digits are shown in clear text (type="text") instead of the
   * masked default (type="password"). Driven by the eye/reveal toggle on the
   * login + register screens so the user can verify what they typed. Defaults
   * to false — masked entry stays the default everywhere else.
   */
  reveal?: boolean;
}

export default function PinInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  length = 6,
  reveal = false,
}: PinInputProps) {
  // The number of refs has to be stable across renders, so we allocate
  // up to 6 ref slots and slice the visible set below. This keeps the
  // useRef call order constant (React rules of hooks).
  const r0 = useRef<HTMLInputElement>(null);
  const r1 = useRef<HTMLInputElement>(null);
  const r2 = useRef<HTMLInputElement>(null);
  const r3 = useRef<HTMLInputElement>(null);
  const r4 = useRef<HTMLInputElement>(null);
  const r5 = useRef<HTMLInputElement>(null);
  const allRefs = [r0, r1, r2, r3, r4, r5];
  const refs = allRefs.slice(0, length);

  const indices = Array.from({ length }, (_, i) => i);
  const digits = indices.map((i) => value[i] ?? "");
  const lastIndex = length - 1;

  const handleChange = (index: number, char: string) => {
    if (disabled) return;
    if (!/^\d?$/.test(char)) return;
    const arr = digits.slice();
    arr[index] = char;
    const next = arr.join("").replace(/\s/g, "");
    onChange(next);

    if (char && index < lastIndex) {
      refs[index + 1].current?.focus();
    }
    if (next.length === length) {
      onComplete?.(next);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        const arr = digits.slice();
        arr[index - 1] = "";
        onChange(arr.join("").trimEnd());
        refs[index - 1].current?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs[index - 1].current?.focus();
    } else if (e.key === "ArrowRight" && index < lastIndex) {
      refs[index + 1].current?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, lastIndex);
    refs[focusIndex].current?.focus();
    if (pasted.length === length) onComplete?.(pasted);
  };

  // 6 boxes is the new default; the row is narrower per box so the strip
  // still fits the same 480-px column without overflow. The 4-box legacy
  // variant keeps the old generous spacing.
  const gapClass = length === 4 ? "gap-3" : "gap-2";
  const boxMaxWidth = length === 4 ? 72 : 52;

  return (
    <div className={`flex ${gapClass} justify-between px-3`}>
      {indices.map((index) => (
        <input
          key={index}
          ref={refs[index]}
          type={reveal ? "text" : "password"}
          inputMode="numeric"
          maxLength={1}
          value={(digits[index] ?? "").trim() || ""}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          className="flex-1 h-14 text-center text-lg font-bold rounded-2xl border-none focus:outline-none focus:ring-2 focus:ring-primary-dark transition-all"
          style={{
            backgroundColor: disabled ? "#EBEAEA" : "#F1F5F9",
            color: disabled ? "#999999" : "#231F20",
            fontFamily: "Nunito, sans-serif",
            opacity: disabled ? 0.55 : 1,
            cursor: disabled ? "not-allowed" : "text",
            maxWidth: boxMaxWidth,
          }}
        />
      ))}
    </div>
  );
}

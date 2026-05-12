"use client";

import { useRef, KeyboardEvent, ClipboardEvent } from "react";

interface PinInputProps {
  value: string;
  onChange: (val: string) => void;
  onComplete?: (val: string) => void;
  disabled?: boolean;
}

export default function PinInput({
  value,
  onChange,
  onComplete,
  disabled = false,
}: PinInputProps) {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const digits = [0, 1, 2, 3].map((i) => value[i] ?? "");

  const handleChange = (index: number, char: string) => {
    if (disabled) return;
    if (!/^\d?$/.test(char)) return;
    const arr = digits.slice();
    arr[index] = char;
    const next = arr.join("").replace(/\s/g, "");
    onChange(next);

    if (char && index < 3) {
      refs[index + 1].current?.focus();
    }
    if (next.length === 4) {
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
    } else if (e.key === "ArrowRight" && index < 3) {
      refs[index + 1].current?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, 3);
    refs[focusIndex].current?.focus();
    if (pasted.length === 4) onComplete?.(pasted);
  };

  return (
    <div className="flex gap-3 justify-between px-3">
      {[0, 1, 2, 3].map((index) => (
        <input
          key={index}
          ref={refs[index]}
          type="password"
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
            backgroundColor: "#F1F5F9",
            color: "#231F20",
            fontFamily: "Nunito, sans-serif",
            opacity: disabled ? 0.5 : 1,
            maxWidth: 72,
          }}
        />
      ))}
    </div>
  );
}

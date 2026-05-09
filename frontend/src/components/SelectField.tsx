"use client";

interface Option {
  value: string | number;
  label: string;
}

interface SelectFieldProps {
  label?: string;
  options: Option[];
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  containerClassName?: string;
}

export default function SelectField({
  label,
  options,
  value,
  onChange,
  disabled = false,
  placeholder = "Select...",
  containerClassName = "",
}: SelectFieldProps) {
  return (
    <div className={`px-3 ${containerClassName}`}>
      {label && (
        <p
          className="text-xs font-bold uppercase tracking-wide mt-3 mb-1.5 ml-1"
          style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
        >
          {label}
        </p>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-2xl px-4 py-3.5 text-base border-none focus:ring-2 focus:ring-primary-dark focus:outline-none appearance-none pr-10"
          style={{
            backgroundColor: disabled ? "#F1F5F9" : "#F1F5F9",
            color: value ? "#231F20" : "#999999",
            fontFamily: "Nunito, sans-serif",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {/* Dropdown arrow */}
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6L8 10L12 6"
              stroke="#6D6D6D"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

"use client";

// Legacy component — kept for compatibility.
// Prefer inline button patterns using the color system from DESIGN_RULES.
interface LoadingButtonProps {
  label: string;
  loadingLabel?: string;
  isLoading?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit" | "reset";
}

export default function LoadingButton({
  label,
  loadingLabel = "Loading...",
  isLoading = false,
  onClick,
  disabled = false,
  fullWidth = true,
  variant = "primary",
  type = "button",
}: LoadingButtonProps) {
  const bgColor =
    variant === "primary"
      ? disabled || isLoading ? "#D3D3D3" : "#064E3B"
      : variant === "secondary"
      ? "transparent"
      : "#E44A4A";

  const textColor =
    variant === "primary"
      ? disabled || isLoading ? "#999999" : "#FFFFFF"
      : variant === "secondary"
      ? "#064E3B"
      : "#FFFFFF";

  const border =
    variant === "secondary"
      ? "2px solid #064E3B"
      : "none";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "16px 24px",
        borderRadius: 20,
        fontWeight: 700,
        fontSize: 16,
        fontFamily: "Nunito, sans-serif",
        backgroundColor: bgColor,
        color: textColor,
        border,
        cursor: disabled || isLoading ? "not-allowed" : "pointer",
        width: fullWidth ? "100%" : "auto",
        transition: "background-color 0.2s",
      }}
    >
      {isLoading && (
        <svg
          className="animate-spin"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="40"
            strokeDashoffset="10"
            strokeLinecap="round"
          />
        </svg>
      )}
      {isLoading ? loadingLabel : label}
    </button>
  );
}

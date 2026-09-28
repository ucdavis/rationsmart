// The app's inline loading spinner (one arc of a circle rotating via
// Tailwind's `animate-spin`). Inherits its colour from the parent via
// currentColor. Replaces ~15 hand-copied SVGs (audit B-21).
export default function Spinner({
  size = 18,
  rounded = true,
}: {
  size?: number;
  /** Round the arc's ends (most call sites). A few older copies didn't. */
  rounded?: boolean;
}) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="40"
        strokeDashoffset="10"
        strokeLinecap={rounded ? "round" : undefined}
      />
    </svg>
  );
}

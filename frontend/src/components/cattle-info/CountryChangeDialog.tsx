"use client";

// N8: Cattle Info → Continue with a different country while feed cards are
// filled. Those feeds belong to the old country, so they are cleared — but
// only after the user agrees. Cancel keeps everything and saves nothing.
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";
import { fillText } from "@/lib/i18n-ui";
import { useEscapeKey } from "@/lib/use-escape";

export interface CountryChangeDialogProps {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
  t: (source: string) => string;
}

export default function CountryChangeDialog({
  count,
  onCancel,
  onConfirm,
  t,
}: CountryChangeDialogProps) {
  useEscapeKey(true, onCancel);
  return (
    <div
      className="fixed top-0 h-full z-50 flex items-center justify-center px-6"
      style={{ left: COLUMN_LEFT, width: COLUMN_WIDTH, backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="country-change-title"
        className="bg-white rounded-2xl w-full max-w-xs pb-5"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
      >
        <h3
          id="country-change-title"
          className="text-center font-bold mt-7 mb-4 px-3"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
        >
          {t("Change country?")}
        </h3>
        <p className="text-center text-sm mb-5 px-3" style={{ color: COLORS.darkSilver }}>
          {fillText(t("Changing the country clears the ${n} selected feeds. Continue?"), {
            n: String(count),
          })}
        </p>
        <div className="flex gap-2 px-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 font-bold"
            style={{
              border: `2px solid ${COLORS.darkAquamarineGreen}`,
              color: COLORS.darkAquamarineGreen,
              background: COLORS.white,
              cursor: "pointer",
              borderRadius: 16,
            }}
          >
            {t("Cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 font-bold"
            style={{
              backgroundColor: COLORS.darkAquamarineGreen,
              color: COLORS.white,
              border: "none",
              cursor: "pointer",
              borderRadius: 16,
            }}
          >
            {t("Continue")}
          </button>
        </div>
      </div>
    </div>
  );
}

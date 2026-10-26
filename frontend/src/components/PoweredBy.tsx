"use client";

import { useT } from "@/lib/i18n-ui";
import { COLORS } from "@/lib/colors";

export default function PoweredBy() {
  const t = useT();
  return (
    <div className="flex flex-col items-center py-3">
      <span className="text-sm" style={{ color: COLORS.darkSilver }}>
        {t("POWERED BY")}
      </span>
      <span className="text-sm" style={{ color: COLORS.darkAquamarineGreen }}>
        {t("DigitalGreen")}
      </span>
    </div>
  );
}

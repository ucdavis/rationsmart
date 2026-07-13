"use client";

import { useT } from "@/lib/i18n-ui";

export default function PoweredBy() {
  const t = useT();
  return (
    <div className="flex flex-col items-center py-3">
      <span className="text-sm" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
        {t("POWERED BY")}
      </span>
      <span
        className="text-sm"
        style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
      >
        {t("DigitalGreen")}
      </span>
    </div>
  );
}

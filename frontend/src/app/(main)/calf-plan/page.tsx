"use client";

// Baby Calf/Heifer result (QA row 8). A calf only needs its milk amount, so
// Cattle Info's Continue comes straight here — no feed selection, diet
// optimisation or diet report.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Toolbar from "@/components/Toolbar";
import { useT } from "@/lib/i18n-ui";
import { COLORS } from "@/lib/colors";
import { IcNewCase } from "@/components/Icons";
import { CalfMilkFeedingCard } from "@/components/report/Y3Cards";
import { buildReportContext } from "@/components/report/parts";

export default function CalfPlanPage() {
  const router = useRouter();
  const cattleInfo = useStore((s) => s.cattleInfo);
  const t = useT(cattleInfo?.simulation_language ?? undefined);
  const isCalf = cattleInfo?.animal_category === "Baby Calf/Heifer";

  // Nothing to show without a calf on the form (e.g. a direct URL visit).
  useEffect(() => {
    if (!isCalf) router.replace("/cattle-info");
  }, [isCalf, router]);
  if (!isCalf) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("Calf Milk Feeding")} onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pb-28">
        <CalfMilkFeedingCard
          reportCtx={buildReportContext("Baby Calf/Heifer")}
          reportData={null}
          cattleInfo={cattleInfo}
          t={t}
        />

        <div className="px-4 mt-2">
          <button
            onClick={() => router.push("/cattle-info")}
            className="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: COLORS.white,
              color: COLORS.darkAquamarineGreen,
              border: `1.5px solid ${COLORS.darkAquamarineGreen}`,
              cursor: "pointer",
            }}
          >
            <IcNewCase size={18} color={COLORS.darkAquamarineGreen} />
            {t("New Case")}
          </button>
        </div>
      </div>
    </div>
  );
}

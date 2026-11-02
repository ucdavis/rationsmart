"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recommendDiet, type CattleInfo } from "@/lib/api";
import { buildRecommendationRequest } from "@/lib/diet-request";
import { useStore } from "@/lib/store";

/**
 * Cattle Info → Continue for a Baby Calf/Heifer (W13). A calf skips Feed
 * Selection: the backend answers POST /v1/animal/diet-recommendation (no
 * feeds, no diet limits) with the milk plan, and stores the run like any
 * other, so it shows in Simulation History and can be saved as a report.
 * The answer goes to the store as a recommendation, then /calf-plan shows it.
 */
export function useCalfRun(translate: (s: string) => string) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  const run = async (cattleInfo: CattleInfo) => {
    // Read the user at call time: Continue may have just switched the
    // user's country to the one picked on the form.
    const { user, setReportData, showSnackbar } = useStore.getState();
    if (!user) return;
    setIsRunning(true);
    try {
      const res = await recommendDiet(buildRecommendationRequest(user, cattleInfo, [], {}));
      setReportData({ ...res.data, mode: "recommendation" }, { cattleInfo, feedSelections: [] });
      router.push("/calf-plan");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : translate("Failed to generate report");
      showSnackbar(message, "error");
    } finally {
      setIsRunning(false);
    }
  };

  return { isRunning, run };
}

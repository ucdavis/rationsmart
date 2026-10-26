"use client";

// Custom Diet Limits specs for the simulation's physiological state
// (GET /v1/animal/diet-thresholds, overridden by the Constraints sheet in
// lib/diet-limit-ranges.ts). Split out of feed-selection/page.tsx (audit B-17).

import { useEffect, useState } from "react";
import { getDietThresholds, sortDietThresholds } from "@/lib/api";
import type { AnimalCategory, DietThresholdSpec } from "@/lib/api";
import { applyDietLimitRanges, dietLimitSpecsFromTable } from "@/lib/diet-limit-ranges";

export function useDietLimitSpecs(
  animalCategory: AnimalCategory,
  limitsApplyToAnimal: boolean,
  user: { id: string } | null
) {
  // Custom Diet Limits specs, fetched per physiological state. `null` while
  // in flight; `[]` never happens on success (the endpoint always returns all
  // eight). `limitSpecsError` holds the reason the dialog is unavailable.
  const [limitSpecs, setLimitSpecs] = useState<DietThresholdSpec[] | null>(null);
  const [limitSpecsError, setLimitSpecsError] = useState<string | null>(null);

  useEffect(() => {
    if (!limitsApplyToAnimal || !user?.id) {
      setLimitSpecs(null);
      setLimitSpecsError(null);
      return;
    }
    let cancelled = false;
    setLimitSpecs(null);
    setLimitSpecsError(null);
    getDietThresholds(animalCategory)
      .then((res) => {
        if (cancelled) return;
        const specs = res.data?.thresholds;
        if (Array.isArray(specs) && specs.length > 0) {
          // Sorted once, here, so the dialog rows and the pre-flight
          // out-of-range list read in the same (Maria's) order.
          // Ranges/defaults come from the "Constraints" sheet
          // (lib/diet-limit-ranges.ts), which wins over the endpoint's.
          setLimitSpecs(sortDietThresholds(applyDietLimitRanges(animalCategory, specs)));
        } else {
          fallBackToTable();
        }
      })
      .catch(() => {
        if (cancelled) return;
        fallBackToTable();
      });
    // Endpoint down or empty: build the rows from the sheet so the dialog
    // still works; "unavailable" only for a state the sheet doesn't cover.
    function fallBackToTable() {
      const fromTable = dietLimitSpecsFromTable(animalCategory);
      if (fromTable) setLimitSpecs(sortDietThresholds(fromTable));
      else setLimitSpecsError("Limits unavailable");
    }
    return () => {
      cancelled = true;
    };
  }, [animalCategory, limitsApplyToAnimal, user?.id]);

  return { limitSpecs, limitSpecsError };
}

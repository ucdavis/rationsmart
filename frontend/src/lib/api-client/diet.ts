// Diet limits and cattle-info field discovery, their display labels, and the
// evaluate / recommend POSTs. Split out of api-client/feeds.ts (audit B-17);
// import from "@/lib/api".

import { api, langParam } from "./client";
import type { DietLimits, EvaluationRequest, RecommendationRequest } from "./models";

// ─── Custom Diet Limits discovery (JWT-protected) ───────────────────────────
// GET /v1/animal/diet-thresholds?physiological_state=Lactating%20Cow
//
// The ONLY source of truth for what the Custom Diet Limits dialog may offer.
// Do NOT hardcode ranges next to it: the accepted range differs per
// physiological state and the engine's values are retuned from time to time
// (a 2026-07-27 retune shipped without the frontend noticing, which is why
// this endpoint exists). Returns 422 for an unknown state and for
// "Baby Calf/Heifer", which is answered with a milk-feeding schedule rather
// than a formulated ration and therefore has no limits to edit.
export interface DietThresholdSpec {
  key: keyof DietLimits;
  /** Engine default for THIS animal, expressed in `unit`. */
  default: number;
  /** Smallest accepted value. Equals `default` when direction is "min". */
  min: number;
  /** Largest accepted value. Equals `default` when direction is "max". */
  max: number;
  /** pct_dm = % of diet DM · mcal_day / kg_day = absolute, never scaled. */
  unit: "pct_dm" | "mcal_day" | "kg_day";
  /** "max" = a ceiling (tightening lowers it) · "min" = a floor (tightening raises it). */
  direction: "max" | "min";
  /**
   * hard               — tightening can return no diet at all (INFEASIBLE)
   * soft               — only penalised in the cost objective, so the diet
   *                      may exceed it
   * hard_after_switch  — soft early in the solve, enforced hard at the end
   *
   * NOT surfaced in the UI. An earlier build rendered `soft` rows as a
   * "Target" badge and the rest as "Limit"; on 2026-09-22 the user
   * (Maria + Satish) ruled that all eight are limits and the hard/soft
   * split is an engine detail — the badge was removed. The field stays on
   * the type because the payload contract and future engine-side work
   * still depend on it; don't reintroduce the badge.
   */
  enforcement: "hard" | "soft" | "hard_after_switch";
}

export interface DietThresholdsResponse {
  physiological_state: string;
  thresholds: DietThresholdSpec[];
}

export const getDietThresholds = (physiological_state: string) =>
  api.get<DietThresholdsResponse>("/v1/animal/diet-thresholds", {
    params: { physiological_state },
  });

// ─── Cattle Info form layout discovery (JWT-protected) ──────────────────────
// GET /v1/animal/cattle-info-fields?physiological_state=Lactating%20Cow
//
// The ONLY source of truth for what the Cattle Info form shows, prefills and
// accepts. Visibility, defaults and ranges all differ per physiological state
// and are retuned server-side, and the SAME table validates `cattle_info` on
// the two diet POSTs — a value outside [min, max] is a 422 there. Do NOT
// hardcode any of it beside this call (same rule as getDietThresholds).
//
// Contract: every field is always returned. RENDER on `visible`, but SUBMIT
// every field — a hidden one goes out as its `default`. That is how
// "Baby Calf/Heifer" renders a single input while the body stays complete.
// `label` / `unit` are English reference strings only; the form owns (and
// translates) its own labels.
export interface CattleInfoFieldSpec {
  key: CattleInfoFieldKey;
  label: string;
  unit: string | null;
  visible: boolean;
  type: "number" | "enum" | "boolean";
  default: number | string | boolean | null;
  min: number | null;
  max: number | null;
  options: string[] | null;
  /** Present on `distance` only — replaces default/min while grazing is ON. */
  when_grazing_on?: { default: number; min: number } | null;
}

export interface CattleInfoFieldsResponse {
  physiological_state: string;
  fields: CattleInfoFieldSpec[];
}

/** Wire keys inside `cattle_info` (see CattleInfoPayload). */
export type CattleInfoFieldKey =
  | "breed"
  | "body_weight"
  | "bw_gain"
  | "bc_score"
  | "days_in_milk"
  | "milk_production"
  | "tp_milk"
  | "fat_milk"
  | "parity"
  | "days_of_pregnancy"
  | "temperature"
  | "grazing"
  | "distance"
  | "topography"
  | "milk_price";

export const getCattleInfoFields = (physiological_state: string) =>
  api.get<CattleInfoFieldsResponse>("/v1/animal/cattle-info-fields", {
    params: { physiological_state },
  });

// Human labels for the eight keys. The endpoint returns the key, the range and
// the unit, but no display name — these stay client-side so they can go
// through the UI-label i18n dictionary like every other string.
export const DIET_LIMIT_LABELS: Record<keyof DietLimits, string> = {
  ash_max: "Ash Max",
  ee_max: "EE Max — Fat",
  ndf_max: "NDF Max — Fiber",
  starch_max: "Starch Max",
  conc_max: "Concentrate Max",
  ndf_for_min: "Forage NDF Min",
  nel_balance_max: "Energy Surplus Max",
  mp_balance_max: "Protein Surplus Max",
};

// Display order for the Custom Diet Limits dialog, specified by Maria on
// 2026-09-22: most-adjusted first, the two absolute-unit surplus keys last.
// The backend returns `thresholds` in its own (engine) order, so the dialog
// sorts with this table. A key the backend adds later that isn't listed here
// still renders — it lands after the known eight rather than disappearing.
export const DIET_LIMIT_DISPLAY_ORDER: (keyof DietLimits)[] = [
  "ndf_for_min",
  "ndf_max",
  "starch_max",
  "conc_max",
  "ee_max",
  "ash_max",
  "nel_balance_max",
  "mp_balance_max",
];

export function sortDietThresholds(specs: DietThresholdSpec[]): DietThresholdSpec[] {
  const rank = (key: keyof DietLimits) => {
    const i = DIET_LIMIT_DISPLAY_ORDER.indexOf(key);
    return i === -1 ? DIET_LIMIT_DISPLAY_ORDER.length : i;
  };
  return [...specs].sort((a, b) => rank(a.key) - rank(b.key));
}

// Unit suffix shown beside the label and in the range hint. `pct_dm` values are
// percentages of diet DM; the other two are ABSOLUTE daily amounts and are sent
// exactly as entered — see the DietLimits contract.
export const DIET_LIMIT_UNIT_LABELS: Record<DietThresholdSpec["unit"], string> = {
  pct_dm: "%",
  mcal_day: "Mcal/day",
  kg_day: "kg/day",
};

// ─── Evaluation & Recommendation (JWT-protected) ────────────────────────────
// i18n V2 — `lang` is a QUERY parameter on these two POSTs, never a body
// field (a `lang` key inside the JSON is silently ignored, and the backend
// then falls back to the account's profile language with no error). It
// matters more here than anywhere else: the backend renders and PERSISTS
// `report_html` at creation time in whichever language the request resolved
// to, and the PDF reuses that stored HTML — so omitting it freezes the report
// in the profile language for a simulation the user ran in another one.
// langParam() resolves cattleInfo.simulation_language first, which is exactly
// the per-simulation LANGUAGE picked on Cattle Info.

export const evaluateDiet = (data: EvaluationRequest) =>
  api.post("/v1/animal/evaluate-diet", data, { params: { ...langParam() } });

export const recommendDiet = (data: RecommendationRequest) =>
  api.post("/v1/animal/diet-recommendation", data, { params: { ...langParam() } });

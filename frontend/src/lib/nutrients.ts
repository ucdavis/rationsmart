// Nutrient fields shown in the custom-feed dialogs (FeedRow's edit dialog and
// Feed Selection's "Custom Feed" sheet), and which of them each feed category
// shows. Mirrors Android DialogFeedDetails: "Additive" → 13 fields incl. NPN,
// "Mineral"/"Minerals" → 4 (DM, Ash, Ca, P), anything else → 12 (no NPN).
// One definition for both dialogs (audit B-21).

export type NutrientKey =
  | "fd_dm"
  | "fd_ash"
  | "fd_cp"
  | "fd_npn_cp"
  | "fd_ee"
  | "fd_st"
  | "fd_ndf"
  | "fd_adf"
  | "fd_lg"
  | "fd_ndin"
  | "fd_adin"
  | "fd_ca"
  | "fd_p";

export interface NutrientField {
  key: NutrientKey;
  /** English label — the UI-label i18n key. */
  label: string;
}

export const NUTRIENT_FIELDS_ADDITIVE: readonly NutrientField[] = [
  { key: "fd_dm", label: "Dry Matter" },
  { key: "fd_ash", label: "Ash" },
  { key: "fd_cp", label: "Protein" },
  { key: "fd_npn_cp", label: "NPN" },
  { key: "fd_ee", label: "Ether Extract" },
  { key: "fd_st", label: "Starch" },
  { key: "fd_ndf", label: "NDF" },
  { key: "fd_adf", label: "ADF" },
  { key: "fd_lg", label: "Lignin" },
  { key: "fd_ndin", label: "NDIN" },
  { key: "fd_adin", label: "ADIN" },
  { key: "fd_ca", label: "Calcium" },
  { key: "fd_p", label: "Phosphorus" },
];

export const NUTRIENT_FIELDS_GENERAL: readonly NutrientField[] = NUTRIENT_FIELDS_ADDITIVE.filter(
  (f) => f.key !== "fd_npn_cp"
);

export const NUTRIENT_FIELDS_MINERAL: readonly NutrientField[] = NUTRIENT_FIELDS_ADDITIVE.filter(
  (f) => f.key === "fd_dm" || f.key === "fd_ash" || f.key === "fd_ca" || f.key === "fd_p"
);

/** The fields a feed of `category` (English identity name) shows. */
export function nutrientFieldsFor(category: string): readonly NutrientField[] {
  if (category === "Additive") return NUTRIENT_FIELDS_ADDITIVE;
  if (category === "Mineral" || category === "Minerals") return NUTRIENT_FIELDS_MINERAL;
  return NUTRIENT_FIELDS_GENERAL;
}

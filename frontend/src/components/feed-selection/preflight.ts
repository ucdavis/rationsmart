// Feed Selection — the checks the Generate button runs before calling the
// diet endpoints, as pure functions. Split out of feed-selection/page.tsx
// (audit B-17); the page turns each result into a dialog or a snackbar.

import { ANIMAL_CATEGORY_LABELS, DIET_LIMIT_LABELS } from "@/lib/api";
import type { AnimalCategory, DietLimits, DietThresholdSpec, FeedItem } from "@/lib/api";
import { isCompleteDietType, isForageType } from "@/lib/feed-type-aliases";
import { inclusionBoundIsInvalid, inclusionBoundsCrossed } from "@/lib/validators";

// Range check for one limit. The endpoint gives an explicit min AND max for
// both directions (for a ceiling `max` is the animal's own default, for the
// `ndf_for_min` floor it's `min`), so one inclusive check covers both — and
// it rejects 0 automatically, since every floor sits above zero.
export function limitOutOfRange(limits: Partial<DietLimits>, spec: DietThresholdSpec): boolean {
  const v = limits[spec.key];
  return v != null && (v < spec.min || v > spec.max);
}

// Cross-field rule the backend enforces on the model: forage NDF is part of
// total NDF, so a floor above the ceiling is unsatisfiable by construction.
// Only checked when the user set BOTH, matching the server-side validator.
export function ndfFloorAboveCeiling(limits: Partial<DietLimits>): boolean {
  return (
    limits.ndf_for_min != null && limits.ndf_max != null && limits.ndf_for_min > limits.ndf_max
  );
}

export type PreflightResult =
  | { kind: "ok" }
  | { kind: "incomplete"; names: string[] }
  | { kind: "noForage" }
  | { kind: "error"; message: string };

export interface PreflightInput {
  items: FeedItem[];
  isEvaluation: boolean;
  /** English feed-type identity → localized label (for the incomplete list). */
  taxonomyTypes: Record<string, string>;
  limits: Partial<DietLimits>;
  limitSpecs: DietThresholdSpec[] | null;
  animalCategory: AnimalCategory;
  t: (source: string) => string;
}

export function generatePreflight({
  items,
  isEvaluation,
  taxonomyTypes,
  limits,
  limitSpecs,
  animalCategory,
  t,
}: PreflightInput): PreflightResult {
  const incomplete = items
    .filter(
      (item) =>
        (item.feed_type_name || item.category_name) &&
        !(
          item.feed_uuid !== null &&
          item.price_per_kg !== null &&
          (!isEvaluation || item.quantity_kg !== null)
        )
    )
    .map((item) => {
      // Show the localized Feed Type label when we have a dict entry
      // (state stores English identity, but users see Hindi on screen).
      // Falls back to sub_category_name (which is already display-agnostic
      // — carries English but the row's Feed dropdown labels come from a
      // different endpoint that translates in place) then to "Feed N".
      const localizedType = item.feed_type_name
        ? (taxonomyTypes[item.feed_type_name] ?? item.feed_type_name)
        : "";
      return (
        localizedType ||
        item.sub_category_name ||
        t("Feed ${N}").replace("${N}", String(items.indexOf(item) + 1))
      );
    });
  if (incomplete.length > 0) {
    return { kind: "incomplete", names: incomplete };
  }
  // Values the number inputs let through but the diet can't use (audit
  // B-14): a negative price, or — in evaluation, where the quantity IS the
  // diet — a quantity of 0 or less. A price of 0 stays allowed (own-farm
  // feed); Android has no such rules, so they only block clear typos.
  const picked = items.filter((item) => item.feed_uuid !== null);
  if (picked.some((item) => item.price_per_kg != null && item.price_per_kg < 0)) {
    return { kind: "error", message: t("Price can't be negative.") };
  }
  if (isEvaluation && picked.some((item) => item.quantity_kg != null && item.quantity_kg <= 0)) {
    return {
      kind: "error",
      message: t("Enter a quantity greater than 0 for every feed, or remove the feed."),
    };
  }
  // Y3 — block generate when no Forage feed is selected. Apply to both
  // recommendation AND evaluation modes per the user's spec. A "Forage"
  // means at least one row whose feed_type_name resolves to Forage
  // (English identity OR any localized alias — see feed-type-aliases.ts)
  // AND has a populated feed_uuid (actually picked, not just typed). A
  // Complete diet feed already contains forage, so it counts too.
  const hasForage = items.some(
    (item) =>
      (isForageType(item.feed_type_name) || isCompleteDietType(item.feed_type_name)) &&
      item.feed_uuid !== null
  );
  if (!hasForage) {
    return { kind: "noForage" };
  }
  // Y3 §1.1.2 — a typed 0 in an inclusion bound is rejected by the
  // backend (`exclusiveMinimum: 0` on min_kg_asfed / max_kg_asfed). Catch
  // it here with the message that says what to do instead. We do NOT
  // coerce it to an omitted key: that would silently throw away what the
  // user asked for, which is the defect, not the fix.
  if (
    !isEvaluation &&
    items.some(
      (it) =>
        it.inclusion_limits_enabled &&
        (inclusionBoundIsInvalid(it.min_kg_per_day) || inclusionBoundIsInvalid(it.max_kg_per_day))
    )
  ) {
    return {
      kind: "error",
      message: t(
        "Enter a value greater than 0, or leave the field empty for no limit. To exclude a feed, remove it from the selection."
      ),
    };
  }
  if (
    !isEvaluation &&
    items.some(
      (it) =>
        it.inclusion_limits_enabled && inclusionBoundsCrossed(it.min_kg_per_day, it.max_kg_per_day)
    )
  ) {
    return { kind: "error", message: t("Minimum can't be more than the maximum.") };
  }
  // Custom Diet Limits are persisted across simulations, but the accepted
  // range is per physiological state — so a limit saved for a Lactating Cow
  // can be out of range once the user switches to a Dry Cow, and the
  // backend would reject the whole request with a 422. Say so here instead
  // of silently dropping the value (dropping it is the original defect) or
  // letting a raw validation error through.
  if (!isEvaluation && limitSpecs) {
    const invalid = limitSpecs
      .filter((spec) => limitOutOfRange(limits, spec))
      .map((sp) => t(DIET_LIMIT_LABELS[sp.key]));
    if (invalid.length > 0 || ndfFloorAboveCeiling(limits)) {
      return {
        kind: "error",
        message: t(
          "Custom Diet Limits are out of range for ${animal} — open them and adjust."
        ).replace("${animal}", t(ANIMAL_CATEGORY_LABELS[animalCategory])),
      };
    }
  }
  return { kind: "ok" };
}

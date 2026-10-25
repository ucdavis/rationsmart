// Builds the two diet-engine request bodies from the Feed Selection screen's
// state. Pure functions, split out of feed-selection/page.tsx (audit B-17) so
// the wire mapping is unit-testable on its own.
import {
  buildDietSimulationId,
  toCattleInfoPayload,
  type CattleInfo,
  type DietLimits,
  type DietThresholdSpec,
  type EvaluationRequest,
  type FeedItem,
  type RecommendationRequest,
} from "@/lib/api";

interface Requester {
  id: string;
  currency?: string | null;
}

/** Rows that can be sent: a feed is picked and it has a price. */
export const sendableFeeds = (items: FeedItem[]) =>
  items.filter((item) => item.feed_uuid !== null && item.price_per_kg !== null);

/**
 * Only limits that were range-checked against the current physiological
 * state's spec are sent (audit B-06). Keys the spec doesn't list (stale, from
 * an older build) can't even be seen in the dialog, so they're dropped — and a
 * Baby Calf/Heifer has no spec at all, so it sends none. With no spec (fetch
 * failed) nothing could be checked, so nothing is sent; the engine then uses
 * its per-state defaults.
 */
export function checkedLimits(
  limits: Partial<DietLimits>,
  specs: DietThresholdSpec[] | null
): Partial<DietLimits> {
  const specKeys = new Set((specs ?? []).map((sp) => sp.key));
  return Object.fromEntries(
    Object.entries(limits).filter(([k]) => specKeys.has(k as keyof DietLimits))
  ) as Partial<DietLimits>;
}

// Backend keys Simulation History by `simulation_id`. "New Case" keeps the
// Simulation Name, so re-running the same case under the other diet mode
// would reuse the id and collapse two history rows into one; the mode suffix
// keeps them distinct. buildDietSimulationId strips any suffix already on the
// name (a restored simulation carries the backend's suffixed id) so it never
// compounds ("Sim 1 (Recommendation) (Recommendation)").

export function buildEvaluationRequest(
  user: Requester,
  cattleInfo: CattleInfo,
  items: FeedItem[]
): EvaluationRequest {
  return {
    user_id: user.id,
    country_id: cattleInfo.country_id,
    // The caller resolves the currency (profile, else the selected country)
    // and refuses to send without one — no silent "USD" (audit D-03).
    currency: user.currency ?? "",
    simulation_id: buildDietSimulationId(cattleInfo.simulation_name, true),
    cattle_info: toCattleInfoPayload(cattleInfo),
    feed_evaluation: sendableFeeds(items).map((item) => ({
      feed_id: item.feed_uuid!,
      quantity_as_fed: item.quantity_kg ?? 0,
      price_per_kg: item.price_per_kg!,
    })),
  };
}

export function buildRecommendationRequest(
  user: Requester,
  cattleInfo: CattleInfo,
  items: FeedItem[],
  limits: Partial<DietLimits>
): RecommendationRequest {
  return {
    user_id: user.id,
    country_id: cattleInfo.country_id,
    simulation_id: buildDietSimulationId(cattleInfo.simulation_name, false),
    cattle_info: toCattleInfoPayload(cattleInfo),
    feed_selection: sendableFeeds(items).map((item) => {
      // Y3 §1.1.2 — bounds only when the toggle is ON and that side has a
      // value. Wire names are min_kg_asfed / max_kg_asfed (FeedWithPrice in
      // the v1 spec); the store's *_per_day names were silently dropped by
      // Pydantic before, leaving the run unconstrained. Rename happens here.
      const base: RecommendationRequest["feed_selection"][number] = {
        feed_id: item.feed_uuid!,
        price_per_kg: item.price_per_kg!,
      };
      if (item.inclusion_limits_enabled) {
        if (item.min_kg_per_day != null) base.min_kg_asfed = item.min_kg_per_day;
        if (item.max_kg_per_day != null) base.max_kg_asfed = item.max_kg_per_day;
      }
      return base;
    }),
    // Send ONLY the limits the user set; omit the key entirely otherwise.
    // Never merge a client-side default underneath (CLAUDE.md §19.1) — an
    // omitted key is how the engine is asked for its per-state default.
    ...(Object.keys(limits).length > 0 ? { base_thresholds: limits } : {}),
  };
}

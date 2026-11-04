import type { FeedItem } from "@/lib/api-client/models";

type Card = Pick<FeedItem, "id" | "feed_uuid" | "sub_category_name">;

/** Feed cards that have a feed picked (N8: what a country change would clear). */
export function filledFeedCount(items: readonly Card[] | null | undefined): number {
  return (items ?? []).filter((r) => !!r.feed_uuid || r.sub_category_name.trim() !== "").length;
}

/**
 * True when another card already holds this feed. One feed may be on only
 * one card: the optimizer would treat two cards of it as two feeds.
 */
export function isFeedOnOtherCard(
  items: readonly Card[],
  feedUuid: string | null | undefined,
  rowId: string | null | undefined
): boolean {
  return !!feedUuid && items.some((r) => r.id !== rowId && r.feed_uuid === feedUuid);
}

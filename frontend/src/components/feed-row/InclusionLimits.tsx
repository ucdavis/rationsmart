"use client";

// FeedRow — the per-feed inclusion limits (Y3 §1.1.2): the "Set inclusion
// limits" toggle and the optional Min / Max kg/day inputs. Split out of
// FeedRow.tsx (audit B-17); it only reads the row and writes through
// onUpdate, so no state is lifted.

import type { FeedItem } from "@/lib/api";
import { inclusionBoundIsInvalid, inclusionBoundsCrossed } from "@/lib/validators";
import { COLORS } from "@/lib/colors";
import { FieldBox, cascadeLoadingProps, innerInputStyle } from "./FieldBox";

export interface InclusionLimitsProps {
  item: FeedItem;
  onUpdate: (id: string, updates: Partial<FeedItem>) => void;
  /** The row's cascade is still loading — fields shimmer and are disabled. */
  rowLoading: boolean;
  t: (source: string) => string;
}

export default function InclusionLimits({ item, onUpdate, rowLoading, t }: InclusionLimitsProps) {
  // A typed 0 in either inclusion bound is a 422 waiting to happen — see
  // inclusionBoundIsInvalid. Flagged here and blocked on Generate.
  const minIsZero = inclusionBoundIsInvalid(item.min_kg_per_day);
  const maxIsZero = inclusionBoundIsInvalid(item.max_kg_per_day);
  // Min above max can't be satisfied; flag both fields (audit B-14).
  const boundsCrossed =
    !minIsZero && !maxIsZero && inclusionBoundsCrossed(item.min_kg_per_day, item.max_kg_per_day);
  const colGap = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } as const;

  return (
    <>
      {/* Y3 §1.1.2 — "Set inclusion limits" toggle + optional Min/Max inputs.
      Gated on feed_uuid: no point setting bounds when no feed is
      picked. The reset effect above clears the toggle + min/max
      whenever feed_uuid goes null (e.g. after a feed-type or
      category change cascades feed_uuid → null). Only the toggle
      switch itself is interactive — clicking the label or the row
      area no longer flips the state (was unintentionally broad).
      The recommendDiet payload omits bounds entirely whenever the
      toggle is off. */}
      <div style={{ padding: "0 10px 14px" }}>
        <div
          className="w-full flex items-center justify-between"
          style={{ padding: "8px 4px", opacity: item.feed_uuid && !rowLoading ? 1 : 0.55 }}
        >
          <span className="font-bold" style={{ color: COLORS.darkAquamarineGreen, fontSize: 13 }}>
            {t("Set inclusion limits")}
          </span>
          <label
            className="toggle-switch"
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: item.feed_uuid && !rowLoading ? "pointer" : "not-allowed" }}
          >
            <input
              type="checkbox"
              aria-label={t("Set inclusion limits")}
              checked={item.inclusion_limits_enabled}
              onChange={() => {
                if (!item.feed_uuid || rowLoading) return;
                onUpdate(item.id, { inclusion_limits_enabled: !item.inclusion_limits_enabled });
              }}
              disabled={!item.feed_uuid || rowLoading}
            />
            <span className={`toggle-slider${rowLoading ? " shimmer" : ""}`} />
          </label>
        </div>

        {item.inclusion_limits_enabled && (
          <>
            <div style={{ ...colGap, marginTop: 8 }}>
              <FieldBox
                label={t("Min (kg/day)")}
                hasValue={item.min_kg_per_day != null}
                disabled={false}
                loading={rowLoading}
                invalid={minIsZero || boundsCrossed}
                optional
              >
                <input
                  aria-label={t("Min (kg/day)")}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  placeholder={t("NA")}
                  value={item.min_kg_per_day ?? ""}
                  onChange={(e) =>
                    onUpdate(item.id, {
                      min_kg_per_day: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  {...cascadeLoadingProps(rowLoading, innerInputStyle)}
                />
              </FieldBox>
              <FieldBox
                label={t("Max (kg/day)")}
                loading={rowLoading}
                hasValue={item.max_kg_per_day != null}
                disabled={false}
                invalid={maxIsZero || boundsCrossed}
                optional
              >
                <input
                  aria-label={t("Max (kg/day)")}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  placeholder={t("No upper bound")}
                  value={item.max_kg_per_day ?? ""}
                  onChange={(e) =>
                    onUpdate(item.id, {
                      max_kg_per_day: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  {...cascadeLoadingProps(rowLoading, innerInputStyle)}
                />
              </FieldBox>
            </div>
            {/* A typed 0 is NOT "no limit" — the backend rejects it with a 422
          (a zero bound degenerates the solve). We must not turn it into
          an omitted key either: silently discarding what the user asked
          for is the original defect this whole area exists to fix. So
          keep the 0 on screen, flag it, and block Generate. */}
            {(minIsZero || maxIsZero) && (
              <p
                style={{
                  color: COLORS.carminePink,
                  fontSize: 11,
                  margin: "6px 2px 0",
                }}
              >
                {t(
                  "Enter a value greater than 0, or leave the field empty for no limit. To exclude a feed, remove it from the selection."
                )}
              </p>
            )}
            {boundsCrossed && (
              <p
                style={{
                  color: COLORS.carminePink,
                  fontSize: 11,
                  margin: "6px 2px 0",
                }}
              >
                {t("Minimum can't be more than the maximum.")}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

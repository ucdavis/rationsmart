"use client";

import type { CSSProperties } from "react";
import type { FeedItem, FeedTaxonomyLabels } from "@/lib/api";
import { useStore } from "@/lib/store";
import { calculateCost } from "@/lib/validators";
import { IcDelete } from "@/components/Icons";
import CustomSelect, { type CustomSelectOption } from "@/components/CustomSelect";
import { useT } from "@/lib/i18n-ui";
import { COLORS } from "@/lib/colors";
import FeedEditDialog from "@/components/feed-row/FeedEditDialog";
import { useFeedCascade } from "@/components/feed-row/useFeedCascade";
import { useFeedEdit } from "@/components/feed-row/useFeedEdit";
import InclusionLimits from "@/components/feed-row/InclusionLimits";
import { useFeedRowSync } from "@/components/feed-row/useFeedRowSync";
import { FieldBox, cascadeLoadingProps, innerInputStyle } from "@/components/feed-row/FieldBox";

// i18n V2 — `name` is the English identity string (used for
// downstream API calls and comparison against item.feed_type_name /
// item.category_name); `display` is the localized label shown in the
// dropdown. Populated via dual-fetch (see getFeedTypesLocalized /
// getFeedCategoriesLocalized). When response arrays don't align (rare),
// display falls back to name.
// i18n V2 — display_name is the translated label shown to the user;
// feed_name is the stable English identifier used for backend lookups
// and comparison against the row's stored sub_category_name.

interface FeedRowProps {
  item: FeedItem;
  index: number;
  showQuantity: boolean;
  feedTypeLocked?: boolean;
  currencySymbol?: string;
  /** When true, the card has a dark-green outer ring and an
   *  "Active for search" pill in the header — tells the user the
   *  global search bar at the top of the page is targeted at this
   *  row. */
  isActive?: boolean;
  /** Tap-anywhere-on-the-card handler. Parent uses it to set
   *  activeRowId = item.id. Calling this is what makes the search
   *  bar's next result populate this row. */
  onActivate?: (id: string) => void;
  /** Fired when ANY of this row's cascade fetches starts or finishes.
   *  Parent aggregates across rows so the Generate button stays disabled
   *  while history-restored data is still resolving — otherwise the
   *  user could submit before stored names have been matched against
   *  the freshly fetched type/category/feed options. */
  onCascadeLoading?: (rowId: string, loading: boolean) => void;
  /** Per-card shortcut: tap the search icon at the bottom of this row
   *  → parent scrolls to the global search bar and focuses it, with
   *  this row already marked as the active target. */
  onJumpToSearch?: () => void;
  onUpdate: (id: string, updates: Partial<FeedItem>) => void;
  onDelete: (id: string) => void;
  /** i18n V2 — English-identity → localized-display maps for Feed Type
   *  and Feed Category. Parent fetches once via fetchFeedTaxonomyLabels
   *  and passes the shared dict here so every row uses the same labels
   *  without each row re-hitting the API. `display` falls back to the
   *  English identity when a mapping is missing. */
  taxonomyLabels?: FeedTaxonomyLabels;
}

// Feed Type radios: one row, a column per type (at most 3, then wrap).
// `auto` tracks shrink to fit, so a long label wraps on narrow phones
// instead of pushing the last radio onto a new row.
const feedTypeGridStyle = (count: number): CSSProperties => ({
  gridTemplateColumns: `repeat(${Math.min(Math.max(count, 1), 3)}, auto)`,
  justifyContent: "space-between",
});

export default function FeedRow({
  item,
  index,
  showQuantity,
  feedTypeLocked = false,
  currencySymbol = "$",
  isActive = false,
  onActivate,
  onCascadeLoading,
  onJumpToSearch,
  onUpdate,
  onDelete,
  taxonomyLabels,
}: FeedRowProps) {
  const user = useStore((s) => s.user);
  const cattleInfo = useStore((s) => s.cattleInfo);
  const showSnackbar = useStore((s) => s.showSnackbar);

  // UI-label i18n — same per-simulation resolution as feed-selection/page.tsx
  // (the parent screen). Reads the COMMITTED store value, not a live form
  // pending value — see src/lib/i18n-ui.ts's doc comment on `langOverride`.
  const t = useT(cattleInfo?.simulation_language ?? user?.preferred_language ?? "en");

  const {
    feedTypes,
    categories,
    subCategories,
    setSubCategories,
    loadingTypes,
    loadingCats,
    loadingSubs,
  } = useFeedCascade({ item, user, onUpdate, showSnackbar, t, taxonomyLabels });

  const { canEdit, showEditModal, openEditModal, dialogProps } = useFeedEdit({
    item,
    user,
    onUpdate,
    setSubCategories,
    showSnackbar,
    t,
  });
  useFeedRowSync({
    item,
    onUpdate,
    onCascadeLoading,
    feedTypes,
    loadingTypes,
    loadingCats,
    loadingSubs,
  });

  // Search lives at the page level (single global bar — see
  // /feed-selection/page.tsx). When the user taps a result, the page
  // pushes the populated values into this row via onUpdate, then the
  // cascade effects above refresh the dropdown options.

  const cost =
    showQuantity && item.price_per_kg !== null && item.quantity_kg !== null
      ? calculateCost(String(item.price_per_kg ?? ""), String(item.quantity_kg ?? ""))
      : null;

  // While this row's own cascade is in flight, treat the WHOLE row as
  // loading — not just Type/Category/Feed. A restored row (simulation
  // history) can already have real Price/Quantity/inclusion-limits
  // values while the cascade is still re-verifying them against fresh
  // options, and those fields are only gated on item.feed_uuid — so
  // without this they'd show real content immediately next to
  // shimmering siblings, the same "mixed ready/loading" look already
  // fixed for Type/Category/Feed and for cattle-info.
  const rowLoading = loadingTypes || loadingCats || loadingSubs;

  const colGap = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } as const;

  return (
    <div
      onClick={() => onActivate?.(item.id)}
      style={{
        backgroundColor: COLORS.white,
        borderRadius: 20,
        boxShadow: isActive
          ? `0 0 0 2px ${COLORS.darkAquamarineGreen}, 0 4px 14px rgba(6,78,59,0.18)`
          : "0 2px 8px rgba(0,0,0,0.07)",
        transition: "box-shadow 0.18s, border-color 0.18s",
        cursor: onActivate ? "pointer" : "default",
      }}
    >
      {/* Card header: FEED # + active pill + edit + delete buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 10px 8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              color: COLORS.darkAquamarineGreen,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            {t("FEED ${N}").replace("${N}", String(index + 1))}
          </span>
          {isActive && (
            <span
              style={{
                backgroundColor: COLORS.brightGrayNew,
                color: COLORS.darkAquamarineGreen,
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 60,
                letterSpacing: 0.2,
              }}
            >
              {t("Selected")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Edit button — green/active once feed is selected (matches Android
              where cv_edit uses go_green_15 bg + dark_aquamarine_green icon).
              Also muted while rowLoading — a restored row can already have
              feed_uuid set while its cascade is still re-verifying, and
              the edit modal reads category_name/etc. that may still settle. */}
          <button
            onClick={openEditModal}
            disabled={!canEdit || rowLoading}
            className={rowLoading ? "shimmer" : undefined}
            style={{
              backgroundColor: rowLoading
                ? undefined
                : canEdit
                  ? COLORS.goGreen15
                  : COLORS.lightGrayNew,
              borderRadius: 10,
              padding: 8,
              border: "none",
              cursor: canEdit && !rowLoading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            aria-label={t("Edit feed nutritional values")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ opacity: rowLoading ? 0 : 1 }}
            >
              <path
                d="M11.5 2.5a1.5 1.5 0 0 1 2.121 2.121L5.5 12.743 2 13.5l.757-3.5L11.5 2.5z"
                stroke={canEdit ? COLORS.darkAquamarineGreen : COLORS.darkSilver}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {/* FEED 1 (index 0) intentionally has NO delete button —
              it's the implicit "main" feed row that always exists.
              Matches the Android app's behaviour and the user's
              expectation that the first card is permanent. */}
          {index > 0 && (
            <button
              onClick={() => onDelete(item.id)}
              style={{
                backgroundColor: COLORS.peachyPink,
                borderRadius: 10,
                padding: 8,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-label={t("Remove feed")}
            >
              <IcDelete size={16} color={COLORS.redRyb} />
            </button>
          )}
        </div>
      </div>

      {/* Search bar lives at the page level (single global bar).
          Tapping anywhere on this card sets it as the activeRowId
          target — see onActivate on the wrapping div above. */}

      {/* Row 2 — Feed Type radio. Matches the visual language of the
          Diet Recommendation / Diet Evaluation radios on the same page:
          plain circle + label, no surrounding box. One row with a column
          per type (Forage, Concentrate, Complete diet) so they line up
          vertically across cards; a long label wraps inside its column. */}
      <div style={{ padding: "0 10px 24px" }}>
        <p className="text-xs font-bold uppercase mb-2 ml-1" style={{ color: COLORS.darkSilver }}>
          {t("Feed Type")}
          <span style={{ color: COLORS.redRyb }}>{" *"}</span>
        </p>
        {loadingTypes ? (
          // Same radio grid as the real content below (three types —
          // Forage / Concentrate / Complete diet — in practice), just
          // non-interactive with a shimmering label bar instead of real
          // text, so there's no layout shift once feedTypes populates.
          <div className="grid gap-3 ml-1" style={feedTypeGridStyle(3)}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: `2px solid ${COLORS.webDivider}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  className="shimmer rounded"
                  style={{ width: 60, height: 12, borderRadius: 4 }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 ml-1" style={feedTypeGridStyle(feedTypes.length)}>
            {feedTypes.map((ft) => {
              const selected = item.feed_type_name === ft.name;
              return (
                <button
                  key={ft.id}
                  type="button"
                  onClick={() => {
                    if (feedTypeLocked) return;
                    if (ft.name === item.feed_type_name) return;
                    // User is actively switching Feed Type — the old
                    // category / feed no longer apply, so wipe them
                    // here explicitly. Relying on the categories
                    // cascade to notice a mismatch would leave stale
                    // values on screen because that cascade's guard
                    // preserves data when feed_uuid is still set
                    // (needed for nav / lang-change round-trips).
                    onUpdate(item.id, {
                      feed_type_id: ft.id,
                      feed_type_name: ft.name,
                      category_id: null,
                      category_name: "",
                      sub_category_id: null,
                      sub_category_name: "",
                      feed_uuid: null,
                      display_name: null,
                    });
                  }}
                  disabled={feedTypeLocked}
                  className="flex items-center gap-2"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: feedTypeLocked ? "not-allowed" : "pointer",
                    justifyContent: "flex-start",
                    opacity: feedTypeLocked && !selected ? 0.55 : 1,
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: `2px solid ${selected ? COLORS.darkAquamarineGreen : COLORS.webDivider}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {selected && (
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: COLORS.darkAquamarineGreen,
                        }}
                      />
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: selected ? 700 : 400,
                      color: selected ? COLORS.darkAquamarineGreen : COLORS.darkSilver,
                      textAlign: "left",
                    }}
                  >
                    {taxonomyLabels?.types?.[ft.name] ?? ft.display}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Row 3 — Feed Category + Feed, stacked full-width. The 50/50
          grid clipped long feed names like "JAT - Mung bean haulm Dry
          Season"; full-width rows let the label render fully and keep
          the trigger taps comfortable on mobile. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 10px 10px" }}>
        {/* Same FieldBox + CustomSelect always renders — loadingCats
            shimmers it in place (via FieldBox's + CustomSelect's own
            `loading` props) instead of swapping in a bare placeholder
            div, so there's no layout drift once the fetch resolves. */}
        <FieldBox
          label={t("Feed Category")}
          hasValue={!!item.category_name}
          disabled={!item.feed_type_name}
          loading={loadingCats}
        >
          <CustomSelect
            transparentTrigger
            value={item.category_id != null ? String(item.category_id) : ""}
            onChange={(v) => {
              const selected = categories.find((c) => c.id === Number(v));
              if (selected?.name === item.category_name) return;
              // User is actively switching Category — wipe the
              // picked feed since it belonged to the old category.
              // Same rationale as the Feed Type onChange above.
              onUpdate(item.id, {
                category_id: selected?.id ?? null,
                category_name: selected?.name ?? "",
                sub_category_id: null,
                sub_category_name: "",
                feed_uuid: null,
                display_name: null,
              });
            }}
            disabled={!item.feed_type_name}
            loading={loadingCats}
            placeholder={!item.feed_type_name ? t("Select type first") : t("Select")}
            emptyLabel={t("No categories found for this feed type")}
            options={categories.map<CustomSelectOption>((c) => ({
              value: String(c.id),
              label: taxonomyLabels?.categories?.[c.name] ?? c.display,
            }))}
          />
        </FieldBox>
        <FieldBox
          label={t("Feed")}
          hasValue={!!item.feed_uuid}
          disabled={!item.category_name}
          loading={loadingSubs}
        >
          <CustomSelect
            transparentTrigger
            value={item.feed_uuid ?? ""}
            onChange={(v) => {
              const selected = subCategories.find((s) => s.feed_uuid === v);
              onUpdate(item.id, {
                sub_category_id: selected ? 1 : null,
                sub_category_name: selected?.feed_name ?? "",
                feed_uuid: selected?.feed_uuid ?? null,
                // i18n V2 — capture the translated name at pick time
                // so /report can fall back to it if the backend's diet
                // endpoints don't yet ship display_name on their rows.
                // getFeedSubCategories no longer sends ?lang= (see api.ts),
                // so selected.display_name is English-only — overlay the
                // taxonomyLabels translation (falls back to English when
                // this specific feed has no translation row yet).
                display_name:
                  (selected &&
                    (taxonomyLabels?.feeds?.[selected.feed_uuid] ?? selected.display_name)) ??
                  null,
              });
            }}
            disabled={!item.category_name}
            loading={loadingSubs}
            placeholder={!item.category_name ? t("Select category") : t("Select feed")}
            emptyLabel={t("No feeds found for this category")}
            options={subCategories.map<CustomSelectOption>((s) => ({
              value: s.feed_uuid,
              label: taxonomyLabels?.feeds?.[s.feed_uuid] ?? s.display_name,
            }))}
          />
        </FieldBox>
      </div>

      <InclusionLimits item={item} onUpdate={onUpdate} rowLoading={rowLoading} t={t} />

      {/* Row 6 — Price (full width, always last among the basic fields).
          Disabled until a feed is selected (no point pricing an empty
          row) — or while rowLoading, since a restored row can already
          have a real price while its cascade is still re-verifying. */}
      <div style={{ padding: "0 10px", paddingBottom: showQuantity ? 10 : 16 }}>
        <FieldBox
          label={t("Price ${currencySymbol}/KG").replace("${currencySymbol}", currencySymbol)}
          hasValue={item.price_per_kg != null && item.price_per_kg !== 0}
          disabled={!item.feed_uuid}
          loading={rowLoading}
        >
          <input
            aria-label={t("Price")}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            disabled={!item.feed_uuid || rowLoading}
            value={item.price_per_kg ?? ""}
            onChange={(e) =>
              onUpdate(item.id, { price_per_kg: e.target.value ? Number(e.target.value) : null })
            }
            {...cascadeLoadingProps(rowLoading, {
              ...innerInputStyle,
              cursor: !item.feed_uuid ? "not-allowed" : "text",
            })}
          />
        </FieldBox>
      </div>

      {/* Row 7 — Quantity + Cost (eval mode only, 50/50) */}
      {showQuantity && (
        <div style={{ ...colGap, padding: "0 10px 16px" }}>
          <FieldBox
            label={t("Quantity")}
            hasValue={item.quantity_kg != null && item.quantity_kg !== 0}
            disabled={!item.price_per_kg}
            loading={rowLoading}
          >
            <input
              aria-label={t("Quantity")}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              disabled={!item.price_per_kg || rowLoading}
              value={item.quantity_kg ?? ""}
              onChange={(e) =>
                onUpdate(item.id, { quantity_kg: e.target.value ? Number(e.target.value) : null })
              }
              {...cascadeLoadingProps(rowLoading, {
                ...innerInputStyle,
                cursor: !item.price_per_kg ? "not-allowed" : "text",
              })}
            />
          </FieldBox>
          <FieldBox label={t("Cost")} hasValue={!!cost} disabled={!cost} loading={rowLoading}>
            <input
              aria-label={t("Cost")}
              type="text"
              readOnly
              value={cost ? `${cost}${currencySymbol ? ` ${currencySymbol}` : ""}` : ""}
              style={{
                ...innerInputStyle,
                color: rowLoading
                  ? "transparent"
                  : cost
                    ? COLORS.darkAquamarineGreen
                    : COLORS.darkSilver,
                fontWeight: cost ? 700 : 400,
                cursor: "default",
              }}
            />
          </FieldBox>
        </div>
      )}

      {/* Per-card "search & fill" shortcut. Lives at the bottom-right
          of every card. Tap → mark this card as the active search
          target AND scroll/focus the global search bar at the top.
          Subtle styling so it doesn't compete with Generate at the
          bottom of the page, but visible enough to discover. */}
      {onJumpToSearch && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 10px 12px" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onActivate?.(item.id);
              onJumpToSearch();
            }}
            aria-label={t("Search to fill FEED ${N}").replace("${N}", String(index + 1))}
            title={t("Search to fill this card")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 60,
              backgroundColor: COLORS.brightGrayNew,
              color: COLORS.darkAquamarineGreen,
              border: "1.5px solid rgba(5,188,109,0.30)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
              <path
                d="M16.5 16.5L21 21"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
            <span>{t("Search to fill")}</span>
          </button>
        </div>
      )}

      {/* Edit Feed bottom sheet — matches Android DialogFeedDetails (isAdd=false).
          On open, /check-insert-or-update determines isInsert:
            isInsert=true  → title "Add Custom Feed", name editable with user prefix
            isInsert=false → title "Edit Nutritional Information", name disabled,
                             prefix derived from "-" split of existing feed name. */}
      {showEditModal && <FeedEditDialog {...dialogProps} t={t} />}
    </div>
  );
}

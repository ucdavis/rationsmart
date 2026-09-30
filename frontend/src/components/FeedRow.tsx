"use client";

import { useEffect, useRef, useState } from "react";
import { updateCustomFeed, insertCustomFeed, checkInsertOrUpdate, getFeedDetails } from "@/lib/api";
import type { FeedItem, FeedTaxonomyLabels } from "@/lib/api";
import { useStore } from "@/lib/store";
import {
  anyNutrientInvalid,
  calculateCost,
  inclusionBoundIsInvalid,
  inclusionBoundsCrossed,
  NUTRIENT_RANGE_MESSAGE,
} from "@/lib/validators";
import { IcDelete } from "@/components/Icons";
import CustomSelect, { type CustomSelectOption } from "@/components/CustomSelect";
import { useT } from "@/lib/i18n-ui";
import { useEscapeKey } from "@/lib/use-escape";
import { COLORS } from "@/lib/colors";
import { type NutrientKey } from "@/lib/nutrients";
import { useLatestRef } from "@/lib/use-latest";
import FeedEditDialog from "@/components/feed-row/FeedEditDialog";
import { useFeedCascade } from "@/components/feed-row/useFeedCascade";

// Decimal-or-empty string for response numerics (matches Android
// formatFeedBreakdownData which strips trailing zeros/decimals).
function fmtNum(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "0";
  return String(parseFloat(n.toFixed(4)));
}

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

// Android Material OutlinedBox style:
// - White background, thin border (gray when empty, dark-green when selected).
// - Label sits ON the top border line at left, with a small white-bg cutout
//   that "interrupts" the border. The red asterisk follows the label.
function FieldBox({
  label,
  hasValue,
  disabled,
  optional,
  loading = false,
  invalid = false,
  children,
}: {
  label: string;
  hasValue: boolean;
  disabled?: boolean;
  optional?: boolean;
  // Paints the outline + label red. Used by the inclusion-limit fields,
  // where a typed 0 is rejected by the backend and must be visible as an
  // error rather than quietly dropped.
  invalid?: boolean;
  // Same box (dimensions, border-radius, label cutout) shimmers in
  // place instead of being swapped for separate skeleton markup — see
  // the cattle-info page's identical pattern for the rationale.
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={loading ? "shimmer" : undefined}
      style={{
        backgroundColor: loading ? undefined : COLORS.white,
        borderRadius: 16,
        border: loading
          ? "1.5px solid transparent"
          : `1.5px solid ${invalid ? COLORS.carminePink : hasValue ? COLORS.darkAquamarineGreen : COLORS.gainsboro}`,
        padding: "16px 12px 12px",
        position: "relative",
        opacity: disabled && !loading ? 0.55 : 1,
        cursor: disabled || loading ? "not-allowed" : "auto",
        minHeight: 60,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* Label cutout on the border — hidden while loading since the
          shimmering box has no fixed background for it to blend into. */}
      {!loading && (
        <span
          style={{
            position: "absolute",
            top: -8,
            left: 12,
            backgroundColor: COLORS.white,
            padding: "0 6px",
            color: invalid
              ? COLORS.carminePink
              : hasValue
                ? COLORS.darkAquamarineGreen
                : COLORS.darkSilver,
            fontSize: 12,
          }}
        >
          {label}
          {!optional && <span style={{ color: COLORS.redRyb }}>{" *"}</span>}
        </span>
      )}
      {children}
    </div>
  );
}

const innerInputStyle = {
  backgroundColor: "transparent",
  color: COLORS.raisinBlack,
  border: "none",
  width: "100%",
  fontSize: 14,
  padding: 0,
  outline: "none",
};

// Same pattern as cattle-info's loadingFieldProps: while the row's own
// cascade (loadingTypes/Cats/Subs) is in flight, Price/Quantity/Cost/
// Min-Max would otherwise show a restored row's REAL values immediately
// (they're only gated on item.feed_uuid, not on the cascade), which is
// the same "some fields ready, some loading" mix that was fixed on
// cattle-info and the Type/Category/Feed fields above. Spread onto a
// native <input> alongside its normal style: `{...cascadeLoadingProps(rowLoading, style)}`.
function cascadeLoadingProps(
  loading: boolean,
  style: React.CSSProperties
): { style: React.CSSProperties; disabled?: boolean; tabIndex?: number } {
  if (!loading) return { style };
  return {
    style: { ...style, color: "transparent", caretColor: "transparent" },
    disabled: true,
    tabIndex: -1,
  };
}

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

  // Search lives at the page level (single global bar — see
  // /feed-selection/page.tsx). When the user taps a result, the page
  // pushes the populated values into this row via onUpdate, then the
  // cascade effects above refresh the dropdown options.

  // Edit feed bottom sheet — matches Android DialogFeedDetails with isAdd=false.
  // On open, calls /check-insert-or-update with countryId + feed_uuid:
  //   isInsert=true  → "Add Custom Feed" title, name editable with user prefix
  //   isInsert=false → "Edit Nutritional Information" title, name disabled,
  //                    prefix is the part before "-" in feedName (if present)
  // Nutrient layout (Additive/Mineral/General) is chosen by category.
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  useEscapeKey(showEditModal && !isSavingEdit, () => setShowEditModal(false));
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [editIsInsert, setEditIsInsert] = useState(false);
  const [editFeedName, setEditFeedName] = useState("");
  const [editNamePrefix, setEditNamePrefix] = useState("");
  const [editFeedDetailsExpanded, setEditFeedDetailsExpanded] = useState(true);
  const [editNutritionalInfoExpanded, setEditNutritionalInfoExpanded] = useState(true);
  const [editForm, setEditForm] = useState<Record<NutrientKey, string>>({
    fd_dm: "",
    fd_ash: "",
    fd_cp: "",
    fd_npn_cp: "",
    fd_ee: "",
    fd_st: "",
    fd_ndf: "",
    fd_adf: "",
    fd_lg: "",
    fd_ndin: "",
    fd_adin: "",
    fd_ca: "",
    fd_p: "",
  });

  const canEdit = !!item.feed_uuid;

  const openEditModal = async () => {
    if (!canEdit || !item.feed_uuid || !user?.country_id || !user?.id) return;
    setShowEditModal(true);
    setIsLoadingEdit(true);
    setEditForm({
      fd_dm: "",
      fd_ash: "",
      fd_cp: "",
      fd_npn_cp: "",
      fd_ee: "",
      fd_st: "",
      fd_ndf: "",
      fd_adf: "",
      fd_lg: "",
      fd_ndin: "",
      fd_adin: "",
      fd_ca: "",
      fd_p: "",
    });
    try {
      // Two calls: check (insert-vs-update) + feed-details (nutrient prefill).
      // The v1 check endpoint no longer returns nutrients, so we fetch them
      // from /feed-details separately. allSettled → details is best-effort;
      // a failed prefill just opens the form blank rather than aborting.
      const [checkRes, detailsRes] = await Promise.allSettled([
        checkInsertOrUpdate(user.country_id, item.feed_uuid, user.id),
        getFeedDetails(item.feed_uuid),
      ]);
      if (checkRes.status === "rejected") throw checkRes.reason;
      const data = checkRes.value.data;
      // v1 check endpoint returns { action, feed_id }: a non-owned (standard)
      // feed UUID → "insert" (editing creates a user-owned derivative), an
      // owned custom-feed UUID → "update". Fall back to the legacy booleans
      // for older backends.
      const isInsert = data?.action
        ? data.action === "insert"
        : (data?.is_insert ?? data?.insert_feed ?? false);
      // feed-details returns the English identity name as `fd_name`.
      const details = (
        detailsRes.status === "fulfilled" ? (detailsRes.value.data ?? {}) : {}
      ) as Record<string, unknown> & { fd_name?: string; feed_name?: string };
      setEditIsInsert(isInsert);
      // Prefill nutrient fields from response (zeros render as "0")
      setEditForm({
        fd_dm: fmtNum(details.fd_dm),
        fd_ash: fmtNum(details.fd_ash),
        fd_cp: fmtNum(details.fd_cp),
        fd_npn_cp: fmtNum(details.fd_npn_cp),
        fd_ee: fmtNum(details.fd_ee),
        fd_st: fmtNum(details.fd_st),
        fd_ndf: fmtNum(details.fd_ndf),
        fd_adf: fmtNum(details.fd_adf),
        fd_lg: fmtNum(details.fd_lg),
        fd_ndin: fmtNum(details.fd_ndin),
        fd_adin: fmtNum(details.fd_adin),
        fd_ca: fmtNum(details.fd_ca),
        fd_p: fmtNum(details.fd_p),
      });
      // Name prefix logic from Android DialogFeedDetails:
      // isInsert=false + name contains "-" → prefix = "firstPart-", value = secondPart
      // else → prefix = user name prefix (first word of full name)
      const fullName =
        (details.fd_name as string) ??
        (details.feed_name as string) ??
        item.sub_category_name ??
        "";
      const userPrefix = user.name ? `${user.name.split(" ")[0]}-` : "";
      if (!isInsert && fullName.includes("-")) {
        const idx = fullName.indexOf("-");
        const firstPart = fullName.substring(0, idx + 1);
        const secondPart = fullName.substring(idx + 1);
        setEditNamePrefix(firstPart);
        setEditFeedName(secondPart);
      } else {
        setEditNamePrefix(userPrefix);
        setEditFeedName(fullName);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("Could not load feed details");
      showSnackbar(msg, "error");
      setShowEditModal(false);
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!user?.id || !user?.country_id || !item.feed_uuid) return;
    if (anyNutrientInvalid(Object.values(editForm))) {
      showSnackbar(t(NUTRIENT_RANGE_MESSAGE), "error");
      return;
    }
    setIsSavingEdit(true);
    try {
      // Mirror Android FeedDetailsViewModel: empty → 0.0 (toDoubleOrZero).
      const toNum = (v: string) => (v ? Number(v) : 0);
      const feed_details: Record<string, unknown> = {
        feed_name: `${editNamePrefix}${editFeedName.trim()}`,
        feed_type: item.feed_type_name ?? "",
        feed_category: item.category_name ?? "",
        // v1 backend requires fd_type/fd_category (or *_id) on custom-feed
        // insert/update; legacy (Android) accepted feed_type/feed_category.
        // Send both key sets using the English-source identity names.
        fd_type: item.feed_type_name ?? "",
        fd_category: item.category_name ?? "",
        country_code: user.country_code ?? "",
        country_name: user.country ?? "",
        fd_dm: toNum(editForm.fd_dm),
        fd_ash: toNum(editForm.fd_ash),
        fd_cp: toNum(editForm.fd_cp),
        fd_npn_cp: toNum(editForm.fd_npn_cp),
        fd_ee: toNum(editForm.fd_ee),
        fd_st: toNum(editForm.fd_st),
        fd_ndf: toNum(editForm.fd_ndf),
        fd_adf: toNum(editForm.fd_adf),
        fd_lg: toNum(editForm.fd_lg),
        fd_ndin: toNum(editForm.fd_ndin),
        fd_adin: toNum(editForm.fd_adin),
        fd_ca: toNum(editForm.fd_ca),
        fd_p: toNum(editForm.fd_p),
      };
      if (editIsInsert) {
        const res = await insertCustomFeed({
          country_id: user.country_id,
          user_id: user.id,
          feed_insert: true,
          feed_details,
        });
        const newName =
          (res.data?.feed_details?.feed_name as string) ??
          `${editNamePrefix}${editFeedName.trim()}`;
        const newId = res.data?.feed_details?.feed_id as string | undefined;
        if (!newId) {
          // Saved, but the response didn't say which feed_id it got. Don't
          // fall back to the ORIGINAL feed's uuid — the row would show the
          // new name while still being bound to the old feed (audit B-04).
          showSnackbar(t("Custom feed saved"), "success");
          setShowEditModal(false);
          return;
        }
        // Android DialogFeedDetails repopulates the spinner after insert
        // so the new feed becomes the selected option. We mirror that
        // by appending the new entry to the local sub-category list
        // *before* committing the row update — otherwise CustomSelect
        // can't find feed_uuid in its options and falls back to the
        // "Select feed" placeholder until the next cascade refetch.
        setSubCategories((prev) =>
          prev.some((s) => s.feed_uuid === newId)
            ? prev
            : // New custom feed — no server translation exists yet, so
              // display_name is just the entered English name.
              [...prev, { feed_name: newName, feed_uuid: newId, display_name: newName }]
        );
        onUpdate(item.id, {
          sub_category_id: 1,
          sub_category_name: newName,
          feed_uuid: newId,
          display_name: newName,
        });
        showSnackbar(t("Custom feed saved"), "success");
      } else {
        await updateCustomFeed({
          country_id: user.country_id,
          user_id: user.id,
          feed_id: item.feed_uuid,
          feed_insert: false,
          feed_details,
        });
        // Reflect any feed-name edit in the dropdown label without
        // waiting for a cascade refetch.
        const updatedName = `${editNamePrefix}${editFeedName.trim()}`;
        if (updatedName && updatedName !== item.sub_category_name) {
          setSubCategories((prev) =>
            prev.map((s) => (s.feed_uuid === item.feed_uuid ? { ...s, feed_name: updatedName } : s))
          );
          onUpdate(item.id, { sub_category_name: updatedName });
        }
        showSnackbar(t("Nutritional values updated"), "success");
      }
      setShowEditModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("Update failed");
      showSnackbar(msg, "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // When the selected feed changes, everything that described the OLD feed
  // must reset, or the new feed silently inherits it (audit B-12):
  // - inclusion toggle + Min/Max, whenever the feed changes or clears;
  // - price + quantity, when one real feed is swapped for another (dropdown
  //   or a search pick over a filled row). Picking the first feed, or a
  //   cascade clearing an invalid one, leaves typed price/quantity alone.
  // The first render is skipped so a restored simulation keeps its values.
  const prevFeedUuid = useRef(item.feed_uuid);
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs5 = useLatestRef({ item, onUpdate });
  useEffect(() => {
    const { item, onUpdate } = effectInputs5.current;
    const prev = prevFeedUuid.current;
    const swapped = prev !== item.feed_uuid;
    prevFeedUuid.current = item.feed_uuid;
    if (!swapped) return;
    const reset: Partial<FeedItem> = {};
    if (
      item.inclusion_limits_enabled ||
      item.min_kg_per_day != null ||
      item.max_kg_per_day != null
    ) {
      reset.inclusion_limits_enabled = false;
      reset.min_kg_per_day = null;
      reset.max_kg_per_day = null;
    }
    if (prev && item.feed_uuid && (item.price_per_kg != null || item.quantity_kg != null)) {
      reset.price_per_kg = null;
      reset.quantity_kg = null;
    }
    if (Object.keys(reset).length > 0) onUpdate(item.id, reset);
  }, [item.feed_uuid, effectInputs5]);

  // Backfill feed_type_id whenever the name is set but the id is null
  // and the matching id is available in `feedTypes`. The types cascade
  // above already backfills inside its .then(), but only once — if the
  // user picks a search result AFTER that fetch has finished (the common
  // case), feed_type_name is set programmatically and feed_type_id stays
  // null. isValid() gates the Generate button on feed_type_id, so without
  // this effect a search-filled row would never unlock the submit. Same
  // effect also covers simulation-history restore and any future flow
  // that updates feed_type_name without the matching id.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs6 = useLatestRef({ item, onUpdate });
  useEffect(() => {
    const { item, onUpdate } = effectInputs6.current;
    if (item.feed_type_name && item.feed_type_id == null && feedTypes.length > 0) {
      const match = feedTypes.find((t) => t.name === item.feed_type_name);
      if (match) onUpdate(item.id, { feed_type_id: match.id });
    }
  }, [feedTypes, item.feed_type_name, item.feed_type_id, effectInputs6]);

  // Bubble per-row cascade loading state up to the parent. The parent
  // sums these across all rows so the Generate button can stay disabled
  // until history-restored data is fully resolved against the latest
  // dropdown options. Without this, a user landing from simulation
  // history could hit Generate while a stored category was still being
  // validated against the live category list, sending stale feed_uuid
  // or partially-matched values.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs7 = useLatestRef({ item, onCascadeLoading });
  useEffect(() => {
    const { item, onCascadeLoading } = effectInputs7.current;
    const loading = loadingTypes || loadingCats || loadingSubs;
    onCascadeLoading?.(item.id, loading);
  }, [loadingTypes, loadingCats, loadingSubs, effectInputs7]);

  // On unmount (row deletion), tell the parent this row is no longer
  // loading so it doesn't get stuck in the loadingRows set forever.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs8 = useLatestRef({ item, onCascadeLoading });
  useEffect(() => {
    const { item, onCascadeLoading } = effectInputs8.current;
    return () => onCascadeLoading?.(item.id, false);
  }, [effectInputs8]);

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
  // A typed 0 in either inclusion bound is a 422 waiting to happen — see
  // inclusionBoundIsInvalid. Flagged here and blocked on Generate.
  const minIsZero = inclusionBoundIsInvalid(item.min_kg_per_day);
  const maxIsZero = inclusionBoundIsInvalid(item.max_kg_per_day);
  // Min above max can't be satisfied; flag both fields (audit B-14).
  const boundsCrossed =
    !minIsZero && !maxIsZero && inclusionBoundsCrossed(item.min_kg_per_day, item.max_kg_per_day);

  const colGap = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } as const;

  return (
    <div
      onClick={() => onActivate?.(item.id)}
      style={{
        backgroundColor: "#fff",
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
          plain circle + label, no surrounding box. Two-column grid so
          Forage and Concentrate line up vertically across cards. */}
      <div style={{ padding: "0 10px 24px" }}>
        <p className="text-xs font-bold uppercase mb-2 ml-1" style={{ color: COLORS.darkSilver }}>
          {t("Feed Type")}
          <span style={{ color: COLORS.redRyb }}>{" *"}</span>
        </p>
        {loadingTypes ? (
          // Same 2-column radio grid as the real content below (feed
          // types are always exactly Forage/Concentrate in practice —
          // see CLAUDE.md §6), just non-interactive with a shimmering
          // label bar instead of real text, so there's no layout shift
          // once feedTypes populates.
          <div className="grid grid-cols-2 gap-3 ml-1">
            {[0, 1].map((i) => (
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
                  style={{ width: 70, height: 12, borderRadius: 4 }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 ml-1">
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
                      whiteSpace: "nowrap",
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
      {showEditModal && (
        <FeedEditDialog
          editFeedDetailsExpanded={editFeedDetailsExpanded}
          editFeedName={editFeedName}
          editForm={editForm}
          editIsInsert={editIsInsert}
          editNamePrefix={editNamePrefix}
          editNutritionalInfoExpanded={editNutritionalInfoExpanded}
          handleEditSubmit={handleEditSubmit}
          isLoadingEdit={isLoadingEdit}
          isSavingEdit={isSavingEdit}
          item={item}
          setEditFeedDetailsExpanded={setEditFeedDetailsExpanded}
          setEditFeedName={setEditFeedName}
          setEditForm={setEditForm}
          setEditNutritionalInfoExpanded={setEditNutritionalInfoExpanded}
          setShowEditModal={setShowEditModal}
          t={t}
        />
      )}
    </div>
  );
}

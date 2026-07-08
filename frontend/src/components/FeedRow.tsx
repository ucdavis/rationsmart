"use client";

import { useEffect, useState } from "react";
import { getFeedTypes, getFeedTypesLocalized, getFeedCategories, getFeedCategoriesLocalized, getFeedSubCategories, updateCustomFeed, insertCustomFeed, checkInsertOrUpdate } from "@/lib/api";
import type { FeedItem, FeedTaxonomyLabels } from "@/lib/api";
import { isForageType, isRoughageType } from "@/lib/feed-type-aliases";
import { useStore } from "@/lib/store";
import { calculateCost } from "@/lib/validators";
import { IcDelete } from "@/components/Icons";
import CustomSelect, { type CustomSelectOption } from "@/components/CustomSelect";

// Match Android DialogFeedDetails: layout chosen by feedCategory.
type NutrientLayout = "additive" | "mineral" | "general";
function getNutrientLayout(category: string): NutrientLayout {
  if (category === "Additive") return "additive";
  if (category === "Mineral" || category === "Minerals") return "mineral";
  return "general";
}

type EditFormKey =
  | "fd_dm" | "fd_ash" | "fd_cp" | "fd_npn_cp" | "fd_ee" | "fd_st"
  | "fd_ndf" | "fd_adf" | "fd_lg" | "fd_ndin" | "fd_adin" | "fd_ca" | "fd_p";

const NUTRIENT_FIELDS_ADDITIVE: { key: EditFormKey; label: string }[] = [
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
const NUTRIENT_FIELDS_GENERAL: { key: EditFormKey; label: string }[] = [
  { key: "fd_dm", label: "Dry Matter" },
  { key: "fd_ash", label: "Ash" },
  { key: "fd_cp", label: "Protein" },
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
const NUTRIENT_FIELDS_MINERAL: { key: EditFormKey; label: string }[] = [
  { key: "fd_dm", label: "Dry Matter" },
  { key: "fd_ash", label: "Ash" },
  { key: "fd_ca", label: "Calcium" },
  { key: "fd_p", label: "Phosphorus" },
];

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
interface FeedType { id: number; name: string; display: string; }
interface FeedCategory { id: number; name: string; display: string; }
// i18n V2 — display_name is the translated label shown to the user;
// feed_name is the stable English identifier used for backend lookups
// and comparison against the row's stored sub_category_name.
interface FeedSubCategoryItem { feed_name: string; feed_uuid: string; display_name: string; }

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
  children,
}: {
  label: string;
  hasValue: boolean;
  disabled?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        border: `1.5px solid ${hasValue ? "#064E3B" : "#DCE0E4"}`,
        padding: "16px 12px 12px",
        position: "relative",
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "auto",
        minHeight: 60,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* Label cutout on the border */}
      <span
        style={{
          position: "absolute",
          top: -8,
          left: 12,
          backgroundColor: "#FFFFFF",
          padding: "0 6px",
          color: hasValue ? "#064E3B" : "#6D6D6D",
          fontFamily: "Nunito, sans-serif",
          fontSize: 12,
        }}
      >
        {label}
        {!optional && <span style={{ color: "#FC2E20" }}>{" *"}</span>}
      </span>
      {children}
    </div>
  );
}

const innerInputStyle = {
  backgroundColor: "transparent",
  color: "#231F20",
  fontFamily: "Nunito, sans-serif",
  border: "none",
  width: "100%",
  fontSize: 14,
  padding: 0,
  outline: "none",
};

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
  const showSnackbar = useStore((s) => s.showSnackbar);

  const [feedTypes, setFeedTypes] = useState<FeedType[]>([]);
  const [categories, setCategories] = useState<FeedCategory[]>([]);
  const [subCategories, setSubCategories] = useState<FeedSubCategoryItem[]>([]);

  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);

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
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [editIsInsert, setEditIsInsert] = useState(false);
  const [editFeedName, setEditFeedName] = useState("");
  const [editNamePrefix, setEditNamePrefix] = useState("");
  const [editFeedDetailsExpanded, setEditFeedDetailsExpanded] = useState(true);
  const [editNutritionalInfoExpanded, setEditNutritionalInfoExpanded] = useState(true);
  const [editForm, setEditForm] = useState<Record<EditFormKey, string>>({
    fd_dm: "", fd_ash: "", fd_cp: "", fd_npn_cp: "", fd_ee: "", fd_st: "",
    fd_ndf: "", fd_adf: "", fd_lg: "", fd_ndin: "", fd_adin: "", fd_ca: "", fd_p: "",
  });

  const canEdit = !!item.feed_uuid;

  const openEditModal = async () => {
    if (!canEdit || !item.feed_uuid || !user?.country_id || !user?.id) return;
    setShowEditModal(true);
    setIsLoadingEdit(true);
    setEditForm({
      fd_dm: "", fd_ash: "", fd_cp: "", fd_npn_cp: "", fd_ee: "", fd_st: "",
      fd_ndf: "", fd_adf: "", fd_lg: "", fd_ndin: "", fd_adin: "", fd_ca: "", fd_p: "",
    });
    try {
      const res = await checkInsertOrUpdate(user.country_id, item.feed_uuid, user.id);
      const data = res.data as {
        is_insert?: boolean;
        insert_feed?: boolean;
        feed_details?: Record<string, unknown> & { feed_name?: string };
      };
      const isInsert = data?.is_insert ?? data?.insert_feed ?? false;
      const details = data?.feed_details ?? {};
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
      const fullName = (details.feed_name as string) ?? item.sub_category_name ?? "";
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
      const msg = err instanceof Error ? err.message : "Could not load feed details";
      showSnackbar(msg, "error");
      setShowEditModal(false);
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!user?.id || !user?.country_id || !item.feed_uuid) return;
    setIsSavingEdit(true);
    try {
      // Mirror Android FeedDetailsViewModel: empty → 0.0 (toDoubleOrZero).
      const toNum = (v: string) => (v ? Number(v) : 0);
      const feed_details: Record<string, unknown> = {
        feed_name: editIsInsert ? `${editNamePrefix}${editFeedName.trim()}` : `${editNamePrefix}${editFeedName.trim()}`,
        feed_type: item.feed_type_name ?? "",
        feed_category: item.category_name ?? "",
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
        const newName = (res.data?.feed_details?.feed_name as string) ?? `${editNamePrefix}${editFeedName.trim()}`;
        const newId = (res.data?.feed_details?.feed_id as string) ?? item.feed_uuid;
        // Android DialogFeedDetails repopulates the spinner after insert
        // so the new feed becomes the selected option. We mirror that
        // by appending the new entry to the local sub-category list
        // *before* committing the row update — otherwise CustomSelect
        // can't find feed_uuid in its options and falls back to the
        // "Select feed" placeholder until the next cascade refetch.
        setSubCategories((prev) =>
          prev.some((s) => s.feed_uuid === newId)
            ? prev
            // New custom feed — no server translation exists yet, so
            // display_name is just the entered English name.
            : [...prev, { feed_name: newName, feed_uuid: newId!, display_name: newName }]
        );
        onUpdate(item.id, { sub_category_id: 1, sub_category_name: newName, feed_uuid: newId, display_name: newName });
        showSnackbar("Custom feed saved", "success");
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
            prev.map((s) =>
              s.feed_uuid === item.feed_uuid ? { ...s, feed_name: updatedName } : s
            )
          );
          onUpdate(item.id, { sub_category_name: updatedName });
        }
        showSnackbar("Nutritional values updated", "success");
      }
      setShowEditModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Update failed";
      showSnackbar(msg, "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  useEffect(() => {
    if (!user?.country_id || !user?.id) {
      console.warn("[feed-cascade] skipping types fetch — missing user fields", {
        has_country_id: !!user?.country_id,
        has_id: !!user?.id,
      });
      return;
    }
    // Race protection: if user or country changes while the request is
    // in flight, the previous fetch's .then must NOT overwrite the new
    // fetch's result. Cleanup runs before re-fire.
    let cancelled = false;
    // Response-shape helper. Returns identity + display for each option.
    // Backend shapes handled:
    //   1. Array of strings                     → identity == display (no translation)
    //   2. Array of {type_name, display_type}   → identity = type_name, display = display_type
    //   3. Array of {name, display_name}        → identity = name, display = display_name
    // Falls back to identity when display isn't present.
    const extractOptions = (data: unknown): { name: string; display: string }[] => {
      const raw: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { feed_types?: unknown[] })?.feed_types)
          ? (data as { feed_types: unknown[] }).feed_types
          : Array.isArray((data as { unique_feed_types?: unknown[] })?.unique_feed_types)
            ? (data as { unique_feed_types: unknown[] }).unique_feed_types
            : [];
      return raw
        .map((it) => {
          if (typeof it === "string") return { name: it, display: it };
          const o = it as { type_name?: string; name?: string; display_name?: string; display_type?: string };
          const name = o?.type_name ?? o?.name ?? "";
          const display = o?.display_type ?? o?.display_name ?? name;
          return { name, display };
        })
        .filter((o) => o.name);
    };

    // i18n V2 — single fetch with ?lang=. Backend returns objects with
    // both identity (type_name) and localized (display_type) fields.
    // We keep the English identity for storage / downstream API calls
    // and use display_type only for the visible label.
    getFeedTypes(user.country_id, user.id)
      .then((res) => {
        if (cancelled) return;
        console.log("[feed-cascade] /v1/animal/unique-feed-type response:", res.data);
        const opts = extractOptions(res.data);
        // Forage / Roughage always first, regardless of active language.
        // The alias helpers accept the translated identity strings the
        // backend returns when ?lang= is set (e.g. "चारा" ↔ "Forage").
        const sorted = [
          ...opts.filter((o) => isForageType(o.name) || isRoughageType(o.name)),
          ...opts.filter((o) => !isForageType(o.name) && !isRoughageType(o.name)),
        ];
        // i18n V2 — display comes from the shared taxonomyLabels dict
        // fetched by the parent from /v1/animal/feed-name (which does
        // ship translated fields). Falls through to o.display / o.name
        // when no mapping exists (e.g. English mode, or a type absent
        // from the country's feed catalog).
        const types = sorted.map((o, i) => ({
          id: i + 1,
          name: o.name,
          display: taxonomyLabels?.types?.[o.name] ?? o.display,
        }));
        // Stale-identity remap. If the row was persisted while an
        // earlier build was sending ?lang= to unique-feed-type, the
        // stored feed_type_name is a translated string like "चारा".
        // Match it against the known-alias sets and rewrite state to
        // the English identity we now fetch. Prevents a phantom
        // "extra radio" from being synthetically inserted below.
        if (item.feed_type_name && !types.find((t) => t.name === item.feed_type_name)) {
          if (isForageType(item.feed_type_name) && types.find((t) => t.name === "Forage")) {
            onUpdate(item.id, { feed_type_name: "Forage" });
          } else if (isRoughageType(item.feed_type_name) && types.find((t) => t.name === "Roughage")) {
            onUpdate(item.id, { feed_type_name: "Roughage" });
          } else {
            // Genuinely-unknown stored value (e.g. country changed and
            // the previous country's type isn't valid here). Inject a
            // synthetic entry so the row still renders its stored
            // label instead of falling to an empty selection.
            types.unshift({
              id: item.feed_type_id ?? -1,
              name: item.feed_type_name,
              display: item.feed_type_name,
            });
          }
        }
        setFeedTypes(types);
        if (item.feed_type_name) {
          const match = types.find((t) => t.name === item.feed_type_name);
          if (match && match.id !== item.feed_type_id) {
            onUpdate(item.id, { feed_type_id: match.id });
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[feed-cascade] feed types fetch failed:", err?.message, err?.response?.data);
        if (!item.feed_type_name) showSnackbar("Could not load feed types", "error");
      })
      .finally(() => { if (!cancelled) setLoadingTypes(false); });
    return () => { cancelled = true; };
  }, [user?.country_id, showSnackbar]);

  // Categories cascade. We defer the reset until AFTER fetching the new
  // list and only clear category_name/sub_category if the stored values
  // are not in the freshly loaded options — that way simulation-history
  // restoration keeps its values, while a user-driven type change still
  // wipes downstream selections.
  useEffect(() => {
    if (!item.feed_type_name || !user?.country_id || !user?.id) return;
    setLoadingCats(true);
    // Race protection — see the types-cascade useEffect above. Without
    // this, rapidly switching feed type can leave categories from the
    // previous type stuck in the dropdown (the slower request wins).
    let cancelled = false;
    // Same shape rules as the types extractor above. Backend now
    // returns objects with both category_name (identity) and
    // display_category (localized label). Falls back to bare-string
    // rows for backwards compat.
    const extractCatOptions = (data: unknown): { name: string; display: string }[] => {
      const raw: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { categories?: unknown[] })?.categories)
          ? (data as { categories: unknown[] }).categories
          : Array.isArray((data as { unique_feed_categories?: unknown[] })?.unique_feed_categories)
            ? (data as { unique_feed_categories: unknown[] }).unique_feed_categories
            : Array.isArray((data as { feed_categories?: unknown[] })?.feed_categories)
              ? (data as { feed_categories: unknown[] }).feed_categories
              : [];
      return raw
        .map((it) => {
          if (typeof it === "string") return { name: it, display: it };
          const o = it as { category_name?: string; name?: string; display_name?: string; display_category?: string };
          const name = o?.category_name ?? o?.name ?? "";
          const display = o?.display_category ?? o?.display_name ?? name;
          return { name, display };
        })
        .filter((o) => o.name);
    };

    // i18n V2 — single fetch with ?lang= (see api.ts getFeedCategories).
    // Response provides both category_name (identity for comparison /
    // downstream calls) and display_category (visible label).
    getFeedCategories(item.feed_type_name, user.country_id, user.id)
      .then((res) => {
        if (cancelled) return;
        console.log("[feed-cascade] /v1/animal/unique-feed-category response:", res.data);
        const opts = extractCatOptions(res.data);
        // i18n V2 — same dict-lookup pattern as feed types above.
        const newCats = opts.map((o, i) => ({
          id: i + 1,
          name: o.name,
          display: taxonomyLabels?.categories?.[o.name] ?? o.display,
        }));
        // Try exact match first, then a whitespace/case-insensitive
        // fallback so a stray trailing space or capitalisation difference
        // between /search-feeds and /unique-feed-category doesn't nuke
        // the row on remount.
        const norm = (s: string) => (s ?? "").trim().toLowerCase();
        const matched =
          newCats.find((c) => c.name === item.category_name) ??
          newCats.find((c) => norm(c.name) === norm(item.category_name));
        // If the row's stored category isn't in the fetched list but
        // the row has been actively used (feed_uuid picked earlier),
        // inject a synthetic entry so the CustomSelect dropdown still
        // renders the correct label. Without this the Category
        // dropdown appears blank after a nav-back-and-forward even
        // though item.category_name is intact in state.
        if (!matched && item.category_name && (item.feed_uuid || item.category_id != null)) {
          newCats.unshift({
            id: item.category_id ?? -1,
            name: item.category_name,
            display: item.category_name,
          });
        }
        setCategories(newCats);
        if (!matched) {
          // Only wipe when the row has NO feed_uuid to lean on. Once the
          // user has actively picked a feed (feed_uuid set), that pick
          // is the source of truth — treat a name mismatch here as a
          // list-caching quirk, not a reason to discard their selection.
          // Fixes: nav Cattle Info → back → forward would empty Feed 1
          // even though feedSelections had the row cached in the store,
          // because a name-only cascade mismatch cleared everything.
          if (!item.feed_uuid) {
            onUpdate(item.id, { category_id: null, category_name: "", sub_category_id: null, sub_category_name: "", feed_uuid: null });
            setSubCategories([]);
          }
        } else if (matched.id !== item.category_id) {
          onUpdate(item.id, { category_id: matched.id });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[feed-cascade] feed categories fetch failed:", err?.message, err?.response?.data);
        if (!item.category_name) showSnackbar("Could not load categories", "error");
      })
      .finally(() => { if (!cancelled) setLoadingCats(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.feed_type_name, user?.country_id, user?.id]);

  // Sub-categories cascade. Same pattern — only reset feed_uuid if the
  // previously stored uuid isn't present in the freshly loaded list.
  useEffect(() => {
    if (!item.category_name || !item.feed_type_name || !user?.country_id || !user?.id) return;
    setLoadingSubs(true);
    // Race protection — see types-cascade above
    let cancelled = false;
    getFeedSubCategories(item.feed_type_name, item.category_name, user.country_id, user.id)
      .then((res) => {
        if (cancelled) return;
        console.log("[feed-cascade] /v1/animal/feed-name response:", res.data);
        // v1 /v1/animal/feed-name response (per swagger description):
        //   { standard_feeds: [...], custom_feeds: [...] }
        // Each item is a FeedDetailsResponse: { feed_id, fd_name, fd_type,
        // fd_category, ... } — i.e. the UUID is `feed_id` (was `feed_uuid`
        // on legacy) and the display name is `fd_name` (was `feed_name`).
        // Defensive: also accept legacy bare array / sub_categories /
        // feeds wrappers and the older feed_uuid / feed_name keys, so a
        // shape regression doesn't break the dropdown.
        const data = res.data as unknown;
        const standardFeeds = (data as { standard_feeds?: unknown[] })?.standard_feeds;
        const customFeeds = (data as { custom_feeds?: unknown[] })?.custom_feeds;
        const raw: unknown[] = (Array.isArray(standardFeeds) || Array.isArray(customFeeds))
          ? [...(Array.isArray(standardFeeds) ? standardFeeds : []), ...(Array.isArray(customFeeds) ? customFeeds : [])]
          : Array.isArray(data)
            ? data
            : Array.isArray((data as { sub_categories?: unknown[] })?.sub_categories)
              ? (data as { sub_categories: unknown[] }).sub_categories
              : Array.isArray((data as { feeds?: unknown[] })?.feeds)
                ? (data as { feeds: unknown[] }).feeds
                : [];
        const list: FeedSubCategoryItem[] = raw
          .map((it) => {
            const o = it as {
              feed_id?: string; feed_uuid?: string; id?: string;
              fd_name?: string; feed_name?: string; name?: string;
              display_name?: string;
            };
            const uuid = o?.feed_id ?? o?.feed_uuid ?? o?.id;
            const name = o?.fd_name ?? o?.feed_name ?? o?.name;
            // i18n V2 — display_name falls back to English name when no
            // translation exists, so we can render unconditionally.
            const display = o?.display_name ?? name;
            return uuid && name ? { feed_name: name, feed_uuid: uuid, display_name: display } : null;
          })
          .filter((s): s is FeedSubCategoryItem => s !== null);
        const match = list.find(
          (s) => (item.feed_uuid && s.feed_uuid === item.feed_uuid) || s.feed_name === item.sub_category_name
        );
        // If the row has a picked feed_uuid but it's not in the new
        // list (e.g. missing Hindi translation on backend), inject a
        // synthetic entry using the stored data so the dropdown can
        // STILL render the correct label. Without this the Feed
        // dropdown would visually go blank even though the state is
        // intact — the user perceives it as "everything reset".
        if (!match && item.feed_uuid && item.sub_category_name) {
          list.unshift({
            feed_uuid: item.feed_uuid,
            feed_name: item.sub_category_name,
            display_name: item.display_name ?? item.sub_category_name,
          });
        }
        setSubCategories(list);
        if (!match) {
          // Only wipe when the row has NO feed_uuid to lean on. When
          // feed_uuid IS set, the user actively picked this feed at
          // some point — treat a missing entry in the current cascade
          // response as a lang / translation gap on the backend side,
          // not a signal to discard the user's selection. Combined with
          // the synthetic-entry injection above, the dropdown keeps
          // rendering the correct label.
          if (!item.feed_uuid) {
            onUpdate(item.id, { sub_category_id: null, sub_category_name: "", feed_uuid: null });
          }
        } else if (
          match.feed_uuid !== item.feed_uuid ||
          match.feed_name !== item.sub_category_name
        ) {
          onUpdate(item.id, {
            sub_category_id: 1,
            sub_category_name: match.feed_name,
            feed_uuid: match.feed_uuid,
            // i18n V2 — persist the translated display name captured at
            // pick time. The report screen uses this as a fallback for
            // FeedBreakdown / CostEffectiveDiet cells when the backend's
            // diet endpoints don't yet return display_name themselves.
            display_name: match.display_name,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[feed-cascade] sub-categories fetch failed:", err?.message, err?.response?.data);
        // If the row already has a restored sub_category_name / feed_uuid,
        // the visible state is intact — suppress the toast.
        if (!item.sub_category_name && !item.feed_uuid) showSnackbar("Could not load sub-categories", "error");
      })
      .finally(() => { if (!cancelled) setLoadingSubs(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.category_name, item.feed_type_name, user?.country_id, user?.id]);

  // When the selected feed clears (because the user changed feed type or
  // category, or the cascade above invalidated the stored feed_uuid), the
  // inclusion-limits toggle and any stored Min/Max numbers must also reset.
  // Otherwise the new feed inherits stale bounds from the previous one,
  // and the toggle stays "on" against no feed at all.
  useEffect(() => {
    if (!item.feed_uuid && (item.inclusion_limits_enabled || item.min_kg_per_day != null || item.max_kg_per_day != null)) {
      onUpdate(item.id, { inclusion_limits_enabled: false, min_kg_per_day: null, max_kg_per_day: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.feed_uuid]);

  // Backfill feed_type_id whenever the name is set but the id is null
  // and the matching id is available in `feedTypes`. The types cascade
  // above already backfills inside its .then(), but only once — if the
  // user picks a search result AFTER that fetch has finished (the common
  // case), feed_type_name is set programmatically and feed_type_id stays
  // null. isValid() gates the Generate button on feed_type_id, so without
  // this effect a search-filled row would never unlock the submit. Same
  // effect also covers simulation-history restore and any future flow
  // that updates feed_type_name without the matching id.
  useEffect(() => {
    if (item.feed_type_name && item.feed_type_id == null && feedTypes.length > 0) {
      const match = feedTypes.find((t) => t.name === item.feed_type_name);
      if (match) onUpdate(item.id, { feed_type_id: match.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedTypes, item.feed_type_name, item.feed_type_id]);

  // Bubble per-row cascade loading state up to the parent. The parent
  // sums these across all rows so the Generate button can stay disabled
  // until history-restored data is fully resolved against the latest
  // dropdown options. Without this, a user landing from simulation
  // history could hit Generate while a stored category was still being
  // validated against the live category list, sending stale feed_uuid
  // or partially-matched values.
  useEffect(() => {
    const loading = loadingTypes || loadingCats || loadingSubs;
    onCascadeLoading?.(item.id, loading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingTypes, loadingCats, loadingSubs]);

  // On unmount (row deletion), tell the parent this row is no longer
  // loading so it doesn't get stuck in the loadingRows set forever.
  useEffect(() => {
    return () => onCascadeLoading?.(item.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cost = showQuantity && item.price_per_kg !== null && item.quantity_kg !== null
    ? calculateCost(String(item.price_per_kg ?? ""), String(item.quantity_kg ?? ""))
    : null;

  const colGap = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } as const;

  return (
    <div
      onClick={() => onActivate?.(item.id)}
      style={{
        backgroundColor: "#fff",
        borderRadius: 20,
        boxShadow: isActive
          ? "0 0 0 2px #064E3B, 0 4px 14px rgba(6,78,59,0.18)"
          : "0 2px 8px rgba(0,0,0,0.07)",
        transition: "box-shadow 0.18s, border-color 0.18s",
        cursor: onActivate ? "pointer" : "default",
      }}
    >

      {/* Card header: FEED # + active pill + edit + delete buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 10px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontWeight: 700, fontSize: 16 }}>
            FEED {index + 1}
          </span>
          {isActive && (
            <span
              style={{
                backgroundColor: "#E4F7EF",
                color: "#064E3B",
                fontFamily: "Nunito, sans-serif",
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 60,
                letterSpacing: 0.2,
              }}
            >
              Selected
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Edit button — green/active once feed is selected (matches Android
              where cv_edit uses go_green_15 bg + dark_aquamarine_green icon). */}
          <button
            onClick={openEditModal}
            disabled={!canEdit}
            style={{
              backgroundColor: canEdit ? "rgba(5,188,109,0.15)" : "#D3D3D3",
              borderRadius: 10,
              padding: 8,
              border: "none",
              cursor: canEdit ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            aria-label="Edit feed nutritional values"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5a1.5 1.5 0 0 1 2.121 2.121L5.5 12.743 2 13.5l.757-3.5L11.5 2.5z" stroke={canEdit ? "#064E3B" : "#6D6D6D"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
                backgroundColor: "#FEC5BB",
                borderRadius: 10,
                padding: 8,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-label="Remove feed"
            >
              <IcDelete size={16} color="#FC2E20" />
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
        <p
          className="text-xs font-bold uppercase mb-2 ml-1"
          style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
        >
          Feed Type<span style={{ color: "#FC2E20" }}>{" *"}</span>
        </p>
        {loadingTypes ? (
          <div className="shimmer" style={{ height: 40, borderRadius: 16 }} />
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
                    fontFamily: "Nunito, sans-serif",
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: `2px solid ${selected ? "#064E3B" : "#E2E8F0"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {selected && (
                      <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#064E3B" }} />
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: selected ? 700 : 400,
                      color: selected ? "#064E3B" : "#6D6D6D",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ft.display}
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
        {loadingCats ? (
          <div className="shimmer" style={{ height: 60, borderRadius: 16 }} />
        ) : (
          <FieldBox label="Feed Category" hasValue={!!item.category_name} disabled={!item.feed_type_name}>
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
              placeholder={!item.feed_type_name ? "Select type first" : "Select"}
              options={categories.map<CustomSelectOption>((c) => ({ value: String(c.id), label: c.display }))}
            />
          </FieldBox>
        )}
        {loadingSubs ? (
          <div className="shimmer" style={{ height: 60, borderRadius: 16 }} />
        ) : (
          <FieldBox label="Feed" hasValue={!!item.feed_uuid} disabled={!item.category_name}>
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
                  display_name: selected?.display_name ?? null,
                });
              }}
              disabled={!item.category_name}
              placeholder={!item.category_name ? "Select category" : "Select feed"}
              options={subCategories.map<CustomSelectOption>((s) => ({ value: s.feed_uuid, label: s.display_name }))}
            />
          </FieldBox>
        )}
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
          style={{ padding: "8px 4px", opacity: item.feed_uuid ? 1 : 0.55 }}
        >
          <span
            className="font-bold"
            style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 13 }}
          >
            Set inclusion limits
          </span>
          <label
            className="toggle-switch"
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: item.feed_uuid ? "pointer" : "not-allowed" }}
          >
            <input
              type="checkbox"
              checked={item.inclusion_limits_enabled}
              onChange={() => {
                if (!item.feed_uuid) return;
                onUpdate(item.id, { inclusion_limits_enabled: !item.inclusion_limits_enabled });
              }}
              disabled={!item.feed_uuid}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {item.inclusion_limits_enabled && (
          <div style={{ ...colGap, marginTop: 8 }}>
            <FieldBox
              label="Min (kg/day)"
              hasValue={item.min_kg_per_day != null}
              disabled={false}
              optional
            >
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                placeholder="NA"
                value={item.min_kg_per_day ?? ""}
                onChange={(e) =>
                  onUpdate(item.id, { min_kg_per_day: e.target.value ? Number(e.target.value) : null })
                }
                style={innerInputStyle}
              />
            </FieldBox>
            <FieldBox
              label="Max (kg/day)"
              hasValue={item.max_kg_per_day != null}
              disabled={false}
              optional
            >
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                placeholder="No upper bound"
                value={item.max_kg_per_day ?? ""}
                onChange={(e) =>
                  onUpdate(item.id, { max_kg_per_day: e.target.value ? Number(e.target.value) : null })
                }
                style={innerInputStyle}
              />
            </FieldBox>
          </div>
        )}
      </div>

      {/* Row 6 — Price (full width, always last among the basic fields).
          Disabled until a feed is selected (no point pricing an empty
          row). */}
      <div style={{ padding: "0 10px", paddingBottom: showQuantity ? 10 : 16 }}>
        <FieldBox label={`Price ${currencySymbol}/KG`} hasValue={item.price_per_kg != null && item.price_per_kg !== 0} disabled={!item.feed_uuid}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            disabled={!item.feed_uuid}
            value={item.price_per_kg ?? ""}
            onChange={(e) =>
              onUpdate(item.id, { price_per_kg: e.target.value ? Number(e.target.value) : null })
            }
            style={{ ...innerInputStyle, cursor: !item.feed_uuid ? "not-allowed" : "text" }}
          />
        </FieldBox>
      </div>

      {/* Row 7 — Quantity + Cost (eval mode only, 50/50) */}
      {showQuantity && (
        <div style={{ ...colGap, padding: "0 10px 16px" }}>
          <FieldBox label="Quantity" hasValue={item.quantity_kg != null && item.quantity_kg !== 0} disabled={!item.price_per_kg}>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              disabled={!item.price_per_kg}
              value={item.quantity_kg ?? ""}
              onChange={(e) =>
                onUpdate(item.id, { quantity_kg: e.target.value ? Number(e.target.value) : null })
              }
              style={{ ...innerInputStyle, cursor: !item.price_per_kg ? "not-allowed" : "text" }}
            />
          </FieldBox>
          <FieldBox label="Cost" hasValue={!!cost} disabled={!cost}>
            <input
              type="text"
              readOnly
              value={cost ? `${cost}${currencySymbol ? ` ${currencySymbol}` : ""}` : ""}
              style={{
                ...innerInputStyle,
                color: cost ? "#064E3B" : "#9CA3AF",
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
            aria-label={`Search to fill FEED ${index + 1}`}
            title="Search to fill this card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 60,
              backgroundColor: "#E4F7EF",
              color: "#064E3B",
              border: "1.5px solid rgba(5,188,109,0.30)",
              cursor: "pointer",
              fontFamily: "Nunito, sans-serif",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
              <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span>Search to fill</span>
          </button>
        </div>
      )}

      {/* Edit Feed bottom sheet — matches Android DialogFeedDetails (isAdd=false).
          On open, /check-insert-or-update determines isInsert:
            isInsert=true  → title "Add Custom Feed", name editable with user prefix
            isInsert=false → title "Edit Nutritional Information", name disabled,
                             prefix derived from "-" split of existing feed name. */}
      {showEditModal && (() => {
        const layout = getNutrientLayout(item.category_name);
        const fields =
          layout === "additive" ? NUTRIENT_FIELDS_ADDITIVE :
          layout === "mineral" ? NUTRIENT_FIELDS_MINERAL :
          NUTRIENT_FIELDS_GENERAL;
        const title = editIsInsert ? "Add Custom Feed" : "Edit Nutritional Information";
        const submitReady = !isSavingEdit && !isLoadingEdit && editFeedName.trim() !== "";
        return (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !isSavingEdit) setShowEditModal(false); }}
        >
          <div
            className="bg-white rounded-t-2xl px-5 pt-5 pb-8 overflow-y-auto"
            style={{ maxHeight: "90vh", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          >
            {/* Drag handle (Android view_drag_handle) */}
            <div className="flex justify-center mb-3">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
            </div>

            {/* Title with close button */}
            <div className="relative mb-4">
              <h3
                className="text-center font-bold"
                style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
              >
                {title}
              </h3>
              <button
                onClick={() => !isSavingEdit && setShowEditModal(false)}
                style={{ position: "absolute", right: 0, top: 0, background: "none", border: "none", cursor: "pointer" }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5L15 15M15 5L5 15" stroke="#6D6D6D" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Separator line below title */}
            <div className="mb-4" style={{ height: 1, backgroundColor: "#E2E8F0" }} />

            {isLoadingEdit ? (
              <div className="flex items-center justify-center py-12">
                <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#064E3B" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
              </div>
            ) : (
            <>
            {/* Feed Details collapsible section — minus when expanded, plus when collapsed */}
            <button
              onClick={() => setEditFeedDetailsExpanded((p) => !p)}
              className="w-full flex items-center justify-between mb-3"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
            >
              <span className="font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                Feed Details
              </span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9h12" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
                {!editFeedDetailsExpanded && (
                  <path d="M9 3v12" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
                )}
              </svg>
            </button>

            {editFeedDetailsExpanded && (
              <>
                {/* Feed Type — read-only */}
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  Feed Type
                </p>
                <div
                  className="rounded-xl px-4 py-3 text-sm mb-3"
                  style={{ backgroundColor: "#EBEAEA", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                >
                  {item.feed_type_name || "—"}
                </div>

                {/* Feed Category — read-only */}
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  Feed Category
                </p>
                <div
                  className="rounded-xl px-4 py-3 text-sm mb-3"
                  style={{ backgroundColor: "#EBEAEA", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                >
                  {item.category_name || "—"}
                </div>

                {/* Feed Name — prefix + editable suffix (or fully disabled when
                    isInsert=false and the original name already contains "-"). */}
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  Feed Name<span style={{ color: "#FC2E20" }}> *</span>
                </p>
                <div
                  className="flex items-center rounded-xl mb-4"
                  style={{
                    backgroundColor: editIsInsert ? "#F1F5F9" : "#EBEAEA",
                  }}
                >
                  {editNamePrefix && (
                    <span
                      className="pl-4 pr-1 text-sm"
                      style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                    >
                      {editNamePrefix}
                    </span>
                  )}
                  <input
                    type="text"
                    value={editFeedName}
                    onChange={(e) => setEditFeedName(e.target.value.replace(/[^a-zA-Z0-9\s]/g, ""))}
                    disabled={!editIsInsert}
                    className="flex-1 bg-transparent px-3 py-3 text-sm border-none focus:outline-none"
                    style={{
                      color: "#231F20",
                      fontFamily: "Nunito, sans-serif",
                      cursor: !editIsInsert ? "not-allowed" : "text",
                    }}
                  />
                </div>
              </>
            )}

            {/* Nutritional Information collapsible section — minus when expanded, plus when collapsed */}
            <button
              onClick={() => setEditNutritionalInfoExpanded((p) => !p)}
              className="w-full flex items-center justify-between mb-3"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
            >
              <span className="font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                Nutritional Information
              </span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9h12" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
                {!editNutritionalInfoExpanded && (
                  <path d="M9 3v12" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
                )}
              </svg>
            </button>

            {editNutritionalInfoExpanded && (
              <>
                <p className="text-xs mb-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  Nutrient Composition (%)
                </p>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {fields.map((f) => (
                    <div key={f.key}>
                      <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{f.label}</p>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={editForm[f.key]}
                        onChange={(e) => setEditForm((p) => ({ ...p, [f.key]: e.target.value }))}
                        placeholder="0.00"
                        className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                        style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              onClick={handleEditSubmit}
              disabled={!submitReady}
              className="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center"
              style={{
                backgroundColor: submitReady ? "#064E3B" : "#D3D3D3",
                color: submitReady ? "white" : "#999",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: submitReady ? "pointer" : "not-allowed",
              }}
            >
              {isSavingEdit ? (
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
              ) : "Submit"}
            </button>
            </>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}

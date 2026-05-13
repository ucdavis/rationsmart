"use client";

import { useEffect, useState } from "react";
import { getFeedTypes, getFeedCategories, getFeedSubCategories, updateCustomFeed, insertCustomFeed, checkInsertOrUpdate } from "@/lib/api";
import type { FeedItem } from "@/lib/api";
import { useStore } from "@/lib/store";
import { calculateCost } from "@/lib/validators";
import { IcDelete } from "@/components/Icons";

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

interface FeedType { id: number; name: string; }
interface FeedCategory { id: number; name: string; }
interface FeedSubCategoryItem { feed_name: string; feed_uuid: string; }

interface FeedRowProps {
  item: FeedItem;
  index: number;
  showQuantity: boolean;
  feedTypeLocked?: boolean;
  currencySymbol?: string;
  onUpdate: (id: string, updates: Partial<FeedItem>) => void;
  onDelete: (id: string) => void;
}

// Android Material OutlinedBox style:
// - White background, thin border (gray when empty, dark-green when selected).
// - Label sits ON the top border line at left, with a small white-bg cutout
//   that "interrupts" the border. The red asterisk follows the label.
function FieldBox({
  label,
  hasValue,
  disabled,
  children,
}: {
  label: string;
  hasValue: boolean;
  disabled?: boolean;
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
        <span style={{ color: "#FC2E20" }}>{" *"}</span>
      </span>
      {children}
    </div>
  );
}

function ColSelect({
  value,
  onChange,
  disabled,
  children,
  placeholder,
}: {
  value: string | number;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  placeholder: string;
}) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          backgroundColor: "transparent",
          color: value ? "#231F20" : "#9CA3AF",
          fontFamily: "Nunito, sans-serif",
          border: "none",
          width: "100%",
          fontSize: 14,
          padding: "0 24px 0 0",
          appearance: "none",
          WebkitAppearance: "none",
          outline: "none",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
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
  onUpdate,
  onDelete,
}: FeedRowProps) {
  const user = useStore((s) => s.user);
  const showSnackbar = useStore((s) => s.showSnackbar);

  const [feedTypes, setFeedTypes] = useState<FeedType[]>([]);
  const [categories, setCategories] = useState<FeedCategory[]>([]);
  const [subCategories, setSubCategories] = useState<FeedSubCategoryItem[]>([]);

  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);

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
        onUpdate(item.id, { sub_category_name: newName, feed_uuid: newId });
        showSnackbar("Custom feed saved", "success");
      } else {
        await updateCustomFeed({
          country_id: user.country_id,
          user_id: user.id,
          feed_id: item.feed_uuid,
          feed_insert: false,
          feed_details,
        });
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
    if (!user?.country_id || !user?.id) return;
    getFeedTypes(user.country_id, user.id)
      .then((res) => {
        const data = res.data;
        const names: string[] = Array.isArray(data) ? data : [];
        const types = names.map((n, i) => ({ id: i + 1, name: n }));
        setFeedTypes(types);
        if (index === 0 && !item.feed_type_name) {
          const forage = types.find((t) => t.name === "Forage");
          if (forage) onUpdate(item.id, { feed_type_id: forage.id, feed_type_name: forage.name });
        } else if (item.feed_type_name) {
          // Restored from simulation history — sync the placeholder id
          // (assigned in loadSimulation) with the real index in the
          // freshly fetched type list so the dropdown shows the selection.
          const match = types.find((t) => t.name === item.feed_type_name);
          if (match && match.id !== item.feed_type_id) {
            onUpdate(item.id, { feed_type_id: match.id });
          }
        }
      })
      .catch(() => {
        // Silence the toast when the row already has a stored type name
        // (simulation restore case) — the value is still displayed from
        // the store, so the only effect of the failure is an empty
        // dropdown. A toast here would be a false alarm.
        if (!item.feed_type_name) showSnackbar("Could not load feed types", "error");
      })
      .finally(() => setLoadingTypes(false));
  }, [user?.country_id, showSnackbar]);

  // Categories cascade. We defer the reset until AFTER fetching the new
  // list and only clear category_name/sub_category if the stored values
  // are not in the freshly loaded options — that way simulation-history
  // restoration keeps its values, while a user-driven type change still
  // wipes downstream selections.
  useEffect(() => {
    if (!item.feed_type_name || !user?.country_id || !user?.id) return;
    setLoadingCats(true);
    getFeedCategories(item.feed_type_name, user.country_id, user.id)
      .then((res) => {
        const data = res.data;
        const names: string[] = (Array.isArray(data) ? data : data?.unique_feed_categories ?? []).filter(Boolean);
        const newCats = names.map((n, i) => ({ id: i + 1, name: n }));
        setCategories(newCats);
        const matched = newCats.find((c) => c.name === item.category_name);
        if (!matched) {
          onUpdate(item.id, { category_id: null, category_name: "", sub_category_id: null, sub_category_name: "", feed_uuid: null });
          setSubCategories([]);
        } else if (matched.id !== item.category_id) {
          onUpdate(item.id, { category_id: matched.id });
        }
      })
      .catch(() => {
        // Same rationale as the types fetch: if the row already has a
        // restored category_name, the visible state is intact and the
        // empty dropdown is the only consequence. Don't alarm the user.
        if (!item.category_name) showSnackbar("Could not load categories", "error");
      })
      .finally(() => setLoadingCats(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.feed_type_name, user?.country_id, user?.id]);

  // Sub-categories cascade. Same pattern — only reset feed_uuid if the
  // previously stored uuid isn't present in the freshly loaded list.
  useEffect(() => {
    if (!item.category_name || !item.feed_type_name || !user?.country_id || !user?.id) return;
    setLoadingSubs(true);
    getFeedSubCategories(item.feed_type_name, item.category_name, user.country_id, user.id)
      .then((res) => {
        const data = res.data;
        const list: FeedSubCategoryItem[] = (Array.isArray(data) ? data : data?.sub_categories ?? [])
          .filter((s: { feed_name?: string; feed_uuid?: string }) => s.feed_name && s.feed_uuid)
          .map((s: { feed_name: string; feed_uuid: string }) => ({
            feed_name: s.feed_name,
            feed_uuid: s.feed_uuid,
          }));
        setSubCategories(list);
        const match = list.find(
          (s) => (item.feed_uuid && s.feed_uuid === item.feed_uuid) || s.feed_name === item.sub_category_name
        );
        if (!match) {
          onUpdate(item.id, { sub_category_id: null, sub_category_name: "", feed_uuid: null });
        } else if (
          match.feed_uuid !== item.feed_uuid ||
          match.feed_name !== item.sub_category_name
        ) {
          onUpdate(item.id, {
            sub_category_id: 1,
            sub_category_name: match.feed_name,
            feed_uuid: match.feed_uuid,
          });
        }
      })
      .catch(() => {
        // If the row already has a restored sub_category_name / feed_uuid,
        // the visible state is intact — suppress the toast.
        if (!item.sub_category_name && !item.feed_uuid) showSnackbar("Could not load sub-categories", "error");
      })
      .finally(() => setLoadingSubs(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.category_name, item.feed_type_name, user?.country_id, user?.id]);

  const cost = showQuantity && item.price_per_kg !== null && item.quantity_kg !== null
    ? calculateCost(String(item.price_per_kg ?? ""), String(item.quantity_kg ?? ""))
    : null;

  const colGap = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } as const;

  return (
    <div style={{ backgroundColor: "#fff", borderRadius: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>

      {/* Card header: FEED # + edit + delete buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 10px 8px" }}>
        <span style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontWeight: 700, fontSize: 16 }}>
          FEED {index + 1}
        </span>
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

      {/* Row 1: Feed Type (left) + Feed Category (right) */}
      <div style={{ ...colGap, padding: "0 10px 10px" }}>
        {loadingTypes ? (
          <div className="shimmer" style={{ height: 60, borderRadius: 16 }} />
        ) : (
          <FieldBox label="Feed Type" hasValue={!!item.feed_type_id} disabled={feedTypeLocked}>
            <ColSelect
              value={item.feed_type_id ?? ""}
              onChange={(v) => {
                const selected = feedTypes.find((f) => f.id === Number(v));
                onUpdate(item.id, { feed_type_id: selected?.id ?? null, feed_type_name: selected?.name ?? "" });
              }}
              disabled={feedTypeLocked}
              placeholder="Select type"
            >
              {feedTypes.map((ft) => (
                <option key={ft.id} value={ft.id}>{ft.name}</option>
              ))}
            </ColSelect>
          </FieldBox>
        )}
        {loadingCats ? (
          <div className="shimmer" style={{ height: 60, borderRadius: 16 }} />
        ) : (
          <FieldBox label="Feed Category" hasValue={!!item.category_id} disabled={!item.feed_type_id}>
            <ColSelect
              value={item.category_id ?? ""}
              onChange={(v) => {
                const selected = categories.find((c) => c.id === Number(v));
                onUpdate(item.id, { category_id: selected?.id ?? null, category_name: selected?.name ?? "" });
              }}
              disabled={!item.feed_type_id}
              placeholder={!item.feed_type_id ? "Select type first" : "Select"}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </ColSelect>
          </FieldBox>
        )}
      </div>

      {/* Row 2: Feed Sub-category (left) + Price (right) */}
      <div style={{ ...colGap, padding: "0 10px", paddingBottom: showQuantity ? 10 : 16 }}>
        {loadingSubs ? (
          <div className="shimmer" style={{ height: 60, borderRadius: 16 }} />
        ) : (
          <FieldBox label="Feed" hasValue={!!item.feed_uuid} disabled={!item.category_id}>
            <ColSelect
              value={item.feed_uuid ?? ""}
              onChange={(v) => {
                const selected = subCategories.find((s) => s.feed_uuid === v);
                onUpdate(item.id, {
                  sub_category_id: selected ? 1 : null,
                  sub_category_name: selected?.feed_name ?? "",
                  feed_uuid: selected?.feed_uuid ?? null,
                });
              }}
              disabled={!item.category_id}
              placeholder={!item.category_id ? "Select category" : "Select feed"}
            >
              {subCategories.map((s) => (
                <option key={s.feed_uuid} value={s.feed_uuid}>{s.feed_name}</option>
              ))}
            </ColSelect>
          </FieldBox>
        )}
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

      {/* Row 3: Quantity (left) + Cost display (right) — evaluation mode only */}
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
          {/* Cost cell — Android shows the number plus the currency code
              (e.g. "2,800 INR"); the prior glyph-prefix variant rendered as
              "₹2800" / "PHP2800" which looked off. */}
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

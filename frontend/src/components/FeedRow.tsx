"use client";

import { useEffect, useState } from "react";
import { getFeedTypes, getFeedCategories, getFeedSubCategories, updateCustomFeed } from "@/lib/api";
import type { FeedItem } from "@/lib/api";
import { useStore } from "@/lib/store";
import { calculateCost } from "@/lib/validators";
import { IcDelete } from "@/components/Icons";

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

// Label-inside-field design (Android Material outlined-style):
// "Feed Type *" sits at the top-left of the gray filled box, value below.
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
        backgroundColor: "#F1F5F9",
        borderRadius: 16,
        padding: "8px 12px 10px",
        position: "relative",
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "auto",
        minHeight: 60,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          color: hasValue ? "#064E3B" : "#6D6D6D",
          fontFamily: "Nunito, sans-serif",
          fontSize: 12,
          marginBottom: 2,
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

  // Edit feed modal — only nutritional values are editable; type/category/feed name
  // remain read-only per Android dialog_edit_feed.xml (all four fields enabled="false").
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    fd_dm: "", fd_cp: "", fd_ee: "", fd_cf: "", fd_ash: "",
    fd_ndf: "", fd_adf: "", fd_ca: "", fd_p: "", fd_st: "",
  });

  const canEdit = !!item.feed_uuid;

  const openEditModal = () => {
    if (!canEdit) return;
    // Pre-populate with empty values; user fills in updated values
    setShowEditModal(true);
  };

  const handleEditSubmit = async () => {
    if (!user?.id || !user?.country_id || !item.feed_uuid) return;
    setIsSavingEdit(true);
    try {
      const feed_details: Record<string, unknown> = {};
      Object.entries(editForm).forEach(([k, v]) => {
        if (v !== "") feed_details[k] = Number(v);
      });
      feed_details.fd_name = item.sub_category_name ?? "";
      feed_details.fd_type = item.feed_type_name ?? "";
      feed_details.fd_category = item.category_name ?? "";
      await updateCustomFeed({
        country_id: user.country_id,
        user_id: user.id,
        feed_id: item.feed_uuid,
        feed_insert: false,
        feed_details,
      });
      showSnackbar("Nutritional values updated", "success");
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
        }
      })
      .catch(() => showSnackbar("Could not load feed types", "error"))
      .finally(() => setLoadingTypes(false));
  }, [user?.country_id, showSnackbar]);

  useEffect(() => {
    if (!item.feed_type_name || !user?.country_id || !user?.id) return;
    setLoadingCats(true);
    setCategories([]);
    setSubCategories([]);
    onUpdate(item.id, { category_id: null, category_name: "", sub_category_id: null, sub_category_name: "" });
    getFeedCategories(item.feed_type_name, user.country_id, user.id)
      .then((res) => {
        const data = res.data;
        const names: string[] = (Array.isArray(data) ? data : data?.unique_feed_categories ?? []).filter(Boolean);
        setCategories(names.map((n, i) => ({ id: i + 1, name: n })));
      })
      .catch(() => showSnackbar("Could not load categories", "error"))
      .finally(() => setLoadingCats(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.feed_type_name, user?.country_id, user?.id]);

  useEffect(() => {
    if (!item.category_name || !item.feed_type_name || !user?.country_id || !user?.id) return;
    setLoadingSubs(true);
    setSubCategories([]);
    onUpdate(item.id, { sub_category_id: null, sub_category_name: "", feed_uuid: null });
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
      })
      .catch(() => showSnackbar("Could not load sub-categories", "error"))
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
          <FieldBox label="Cost" hasValue={!!cost} disabled={!cost}>
            <input
              type="text"
              readOnly
              value={cost ? `${currencySymbol}${cost}` : ""}
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

      {/* Edit Feed modal — matches Android dialog_edit_feed.xml:
          all four base fields are read-only (Country, Feed Type, Feed Category,
          Feed Name), only nutritional values are editable. */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget && !isSavingEdit) setShowEditModal(false); }}
        >
          <div
            className="bg-white rounded-t-2xl px-4 pt-5 pb-6 overflow-y-auto"
            style={{ maxHeight: "90vh", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>Edit Feed</p>
              <button
                onClick={() => !isSavingEdit && setShowEditModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5L15 15M15 5L5 15" stroke="#6D6D6D" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Read-only fields (gray filled, no border) */}
            {[
              { label: "Country", value: user?.country ?? "" },
              { label: "Feed Type", value: item.feed_type_name ?? "" },
              { label: "Feed Category", value: item.category_name ?? "" },
              { label: "Feed Name", value: item.sub_category_name ?? "" },
            ].map((f) => (
              <div key={f.label} className="mb-3">
                <p className="text-xs mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{f.label}</p>
                <div
                  className="rounded-xl px-3 py-3 text-sm"
                  style={{ backgroundColor: "#EBEAEA", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                >
                  {f.value || "—"}
                </div>
              </div>
            ))}

            {/* Nutritional inputs (editable) */}
            <p className="text-xs font-bold uppercase mt-2 mb-3" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
              Nutrient Composition (%) — optional
            </p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                ["fd_dm", "Dry Matter (DM)"],
                ["fd_cp", "Crude Protein (CP)"],
                ["fd_ee", "Ether Extract (EE)"],
                ["fd_cf", "Crude Fiber (CF)"],
                ["fd_ash", "Ash"],
                ["fd_ndf", "NDF"],
                ["fd_adf", "ADF"],
                ["fd_ca", "Calcium (Ca)"],
                ["fd_p", "Phosphorus (P)"],
                ["fd_st", "Starch"],
              ].map(([k, label]) => (
                <div key={k}>
                  <p className="text-xs mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{label}</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={editForm[k as keyof typeof editForm]}
                    onChange={(e) => setEditForm((p) => ({ ...p, [k]: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                    style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleEditSubmit}
              disabled={isSavingEdit}
              className="w-full py-3.5 rounded-xl font-bold text-base text-white flex items-center justify-center"
              style={{ backgroundColor: "#064E3B", border: "none", fontFamily: "Nunito, sans-serif", cursor: isSavingEdit ? "not-allowed" : "pointer" }}
            >
              {isSavingEdit ? (
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
              ) : "Submit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getFeedTypes, getFeedCategories, getFeedSubCategories } from "@/lib/api";
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

const selStyle = {
  backgroundColor: "#F1F5F9",
  color: "#231F20",
  fontFamily: "Nunito, sans-serif",
  borderRadius: 16,
  border: "none",
  width: "100%",
  fontSize: 14,
  padding: "10px 32px 10px 12px",
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
  outline: "none",
  minHeight: 48,
};

const inputStyle = {
  backgroundColor: "#F1F5F9",
  color: "#231F20",
  fontFamily: "Nunito, sans-serif",
  borderRadius: 16,
  border: "none",
  width: "100%",
  fontSize: 14,
  padding: "10px 12px",
  outline: "none",
  minHeight: 48,
  boxSizing: "border-box" as const,
};

function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      color: "#6D6D6D",
      fontFamily: "Nunito, sans-serif",
      fontSize: 11,
      fontWeight: 700,
      margin: "0 0 4px 2px",
      textTransform: "uppercase",
      letterSpacing: "0.03em",
    }}>
      {children}
    </p>
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
    <div style={{ position: "relative" }}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          ...selStyle,
          color: value ? "#231F20" : "#9CA3AF",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

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
          {/* Edit button — present on all cards, matching Android */}
          <button
            style={{
              backgroundColor: "#D3D3D3",
              borderRadius: 10,
              padding: 8,
              border: "none",
              cursor: "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            aria-label="Edit feed"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5a1.5 1.5 0 0 1 2.121 2.121L5.5 12.743 2 13.5l.757-3.5L11.5 2.5z" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
        <div>
          <ColLabel>Feed Type</ColLabel>
          {loadingTypes ? (
            <div className="shimmer" style={{ height: 48, borderRadius: 16 }} />
          ) : (
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
          )}
        </div>
        <div>
          <ColLabel>Category</ColLabel>
          {loadingCats ? (
            <div className="shimmer" style={{ height: 48, borderRadius: 16 }} />
          ) : (
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
          )}
        </div>
      </div>

      {/* Row 2: Feed Sub-category (left) + Price (right) */}
      <div style={{ ...colGap, padding: "0 10px", paddingBottom: showQuantity ? 10 : 16 }}>
        <div>
          <ColLabel>Feed</ColLabel>
          {loadingSubs ? (
            <div className="shimmer" style={{ height: 48, borderRadius: 16 }} />
          ) : (
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
          )}
        </div>
        <div>
          <ColLabel>Price/kg ({currencySymbol})</ColLabel>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            placeholder={!item.feed_uuid ? "Select feed" : "0.00"}
            disabled={!item.feed_uuid}
            value={item.price_per_kg ?? ""}
            onChange={(e) =>
              onUpdate(item.id, { price_per_kg: e.target.value ? Number(e.target.value) : null })
            }
            style={{ ...inputStyle, opacity: !item.feed_uuid ? 0.5 : 1, cursor: !item.feed_uuid ? "not-allowed" : "text" }}
          />
        </div>
      </div>

      {/* Row 3: Quantity (left) + Cost display (right) — evaluation mode only */}
      {showQuantity && (
        <div style={{ ...colGap, padding: "0 10px 16px" }}>
          <div>
            <ColLabel>Quantity (kg)</ColLabel>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              placeholder={!item.price_per_kg ? "Enter price" : "0.0"}
              disabled={!item.price_per_kg}
              value={item.quantity_kg ?? ""}
              onChange={(e) =>
                onUpdate(item.id, { quantity_kg: e.target.value ? Number(e.target.value) : null })
              }
              style={{ ...inputStyle, opacity: !item.price_per_kg ? 0.5 : 1, cursor: !item.price_per_kg ? "not-allowed" : "text" }}
            />
          </div>
          <div>
            <ColLabel>Cost/day</ColLabel>
            <input
              type="text"
              readOnly
              value={cost ? `${currencySymbol}${cost}` : ""}
              placeholder="—"
              style={{
                ...inputStyle,
                backgroundColor: "#EBEAEA",
                color: cost ? "#064E3B" : "#9CA3AF",
                fontWeight: cost ? 700 : 400,
                cursor: "default",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

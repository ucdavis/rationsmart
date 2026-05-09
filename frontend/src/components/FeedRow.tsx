"use client";

import { useEffect, useState } from "react";
import { getFeedTypes, getFeedCategories, getFeedSubCategories } from "@/lib/api";
import type { FeedItem } from "@/lib/api";
import { useStore } from "@/lib/store";
import { calculateCost } from "@/lib/validators";
import { IcDelete } from "@/components/Icons";

interface FeedType { id: number; name: string; }
interface FeedCategory { id: number; name: string; }
// Matches actual API response from /feed-name/
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

const sel = {
  backgroundColor: "#F1F5F9",
  color: "#231F20",
  fontFamily: "Nunito, sans-serif",
};

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs font-bold uppercase tracking-wide mb-1.5"
      style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
    >
      {children}
    </p>
  );
}

function RowSelect({
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
    <div className="relative">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-2xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark appearance-none pr-9"
        style={{ ...sel, color: value ? "#231F20" : "#999999", opacity: disabled ? 0.5 : 1 }}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
        // API returns List<String> (feed type names)
        const data = res.data;
        const names: string[] = Array.isArray(data) ? data : [];
        const types = names.map((n, i) => ({ id: i + 1, name: n }));
        setFeedTypes(types);
        // Auto-select Forage for the first feed card (matches Android FeedViewModel default)
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
        // API returns List<{feed_name, feed_uuid, feed_category, feed_type, feed_cd}>
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

  return (
    <div
      className="bg-white rounded-2xl p-4 space-y-3"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      {/* Row header */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
        >
          Feed #{index + 1}
        </span>
        {/* Android: isDelete = !isFirstItem — first card has no delete button */}
        {index > 0 && (
          <button
            onClick={() => onDelete(item.id)}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ backgroundColor: "#FEC5BB", border: "none", cursor: "pointer" }}
            aria-label="Remove feed"
          >
            <IcDelete size={16} color="#FC2E20" />
          </button>
        )}
      </div>

      {/* Feed Type */}
      <div>
        <RowLabel>Feed Type</RowLabel>
        {loadingTypes ? (
          <div className="h-11 rounded-2xl shimmer" />
        ) : (
          <RowSelect
            value={item.feed_type_id ?? ""}
            onChange={(v) => {
              const selected = feedTypes.find((f) => f.id === Number(v));
              onUpdate(item.id, { feed_type_id: selected?.id ?? null, feed_type_name: selected?.name ?? "" });
            }}
            disabled={feedTypeLocked}
            placeholder="Select feed type..."
          >
            {feedTypes.map((ft) => (
              <option key={ft.id} value={ft.id}>{ft.name}</option>
            ))}
          </RowSelect>
        )}
      </div>

      {/* Feed Category */}
      <div>
        <RowLabel>Feed Category</RowLabel>
        {loadingCats ? (
          <div className="h-11 rounded-2xl shimmer" />
        ) : (
          <RowSelect
            value={item.category_id ?? ""}
            onChange={(v) => {
              const selected = categories.find((c) => c.id === Number(v));
              onUpdate(item.id, { category_id: selected?.id ?? null, category_name: selected?.name ?? "" });
            }}
            disabled={!item.feed_type_id}
            placeholder={!item.feed_type_id ? "Select feed type first" : "Select category..."}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </RowSelect>
        )}
      </div>

      {/* Sub-Category */}
      <div>
        <RowLabel>Feed Sub-Category</RowLabel>
        {loadingSubs ? (
          <div className="h-11 rounded-2xl shimmer" />
        ) : (
          <RowSelect
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
            placeholder={!item.category_id ? "Select category first" : "Select feed item..."}
          >
            {subCategories.map((s) => (
              <option key={s.feed_uuid} value={s.feed_uuid}>{s.feed_name}</option>
            ))}
          </RowSelect>
        )}
      </div>

      {/* Price + Quantity */}
      {/* Android: price disabled until subcategory selected; quantity disabled until price filled */}
      <div className={`grid gap-3 ${showQuantity ? "grid-cols-2" : "grid-cols-1"}`}>
        <div>
          <RowLabel>Price/kg ({currencySymbol})</RowLabel>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            placeholder={!item.feed_uuid ? "Select feed first" : "0.00"}
            disabled={!item.feed_uuid}
            value={item.price_per_kg ?? ""}
            onChange={(e) =>
              onUpdate(item.id, { price_per_kg: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full rounded-2xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={{ ...sel, opacity: !item.feed_uuid ? 0.5 : 1 }}
          />
        </div>

        {showQuantity && (
          <div>
            <RowLabel>Quantity (kg/day)</RowLabel>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              placeholder={!item.price_per_kg ? "Enter price first" : "0.0"}
              disabled={!item.price_per_kg}
              value={item.quantity_kg ?? ""}
              onChange={(e) =>
                onUpdate(item.id, { quantity_kg: e.target.value ? Number(e.target.value) : null })
              }
              className="w-full rounded-2xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
              style={{ ...sel, opacity: !item.price_per_kg ? 0.5 : 1 }}
            />
          </div>
        )}
      </div>

      {/* Cost display in evaluation mode */}
      {showQuantity && item.price_per_kg !== null && item.quantity_kg !== null && (
        (() => {
          const cost = calculateCost(
            String(item.price_per_kg ?? ""),
            String(item.quantity_kg ?? "")
          );
          return cost ? (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-2.5"
              style={{ backgroundColor: "#F0FDF4" }}
            >
              <span
                className="text-xs font-bold uppercase"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                Cost/day
              </span>
              <span
                className="text-sm font-bold"
                style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
              >
                {currencySymbol}{cost}
              </span>
            </div>
          ) : null;
        })()
      )}
    </div>
  );
}

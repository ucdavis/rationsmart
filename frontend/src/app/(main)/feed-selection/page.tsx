"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import FeedRow from "@/components/FeedRow";
import Toolbar from "@/components/Toolbar";
import { evaluateDiet, recommendDiet, getFeedTypes, getFeedCategories, insertCustomFeed, checkInsertOrUpdate, updateCustomFeed, toCattleInfoPayload, DEFAULT_BASE_THRESHOLDS } from "@/lib/api";
import type { FeedItem, DietLimits } from "@/lib/api";
import { IcAddFeed } from "@/components/Icons";

let idCounter = 0;
const createFeedItem = (): FeedItem => ({
  id: `feed_${++idCounter}_${Date.now()}`,
  feed_type_id: null,
  feed_type_name: "",
  category_id: null,
  category_name: "",
  sub_category_id: null,
  sub_category_name: "",
  feed_uuid: null,
  price_per_kg: null,
  quantity_kg: null,
});

// Matches Android BaseThresholds — single max value per nutrient
const LIMIT_ROWS: { label: string; key: keyof DietLimits }[] = [
  { label: "Ash Max (%)", key: "ash_max" },
  { label: "EE Max (%) — Fat", key: "ee_max" },
  { label: "NDF Max (%)", key: "ndf_max" },
  { label: "Starch Max (%)", key: "starch_max" },
];

// Custom feed form
const EMPTY_CUSTOM = {
  feed_type: "",
  feed_category: "",
  feed_name: "",
  fd_dm: "",
  fd_cp: "",
  fd_ee: "",
  fd_cf: "",
  fd_ash: "",
  fd_ndf: "",
  fd_adf: "",
  fd_ca: "",
  fd_p: "",
  fd_st: "",
  fd_adin: "",
  fd_cellulose: "",
  fd_hemicellulose: "",
  fd_lg: "",
  fd_ndin: "",
  nfe_pct: "",
  fd_npn_cp: "",
};

function CustomFeedNutrientInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{label}</p>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
        style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
      />
    </div>
  );
}

export default function FeedSelectionPage() {
  const router = useRouter();
  const {
    user,
    cattleInfo,
    feedSelections,
    setFeedSelections,
    feedSelectionType,
    setFeedSelectionType,
    setReportData,
    dietLimits,
    setDietLimits,
    showSnackbar,
  } = useStore((s) => ({
    user: s.user,
    cattleInfo: s.cattleInfo,
    feedSelections: s.feedSelections,
    setFeedSelections: s.setFeedSelections,
    feedSelectionType: s.feedSelectionType,
    setFeedSelectionType: s.setFeedSelectionType,
    setReportData: s.setReportData,
    dietLimits: s.dietLimits,
    setDietLimits: s.setDietLimits,
    showSnackbar: s.showSnackbar,
  }));

  const currencySymbol = (() => {
    const code = user?.currency ?? "";
    try { return (0).toLocaleString("en", { style: "currency", currency: code, minimumFractionDigits: 0 }).replace(/[0-9,.\s]/g, "").trim() || code || "$"; }
    catch { return code || "$"; }
  })();

  const [items, setItems] = useState<FeedItem[]>(() => {
    const stored = feedSelections.length > 0 ? [...feedSelections] : [];
    while (stored.length < 3) stored.push(createFeedItem());
    return stored;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [limits, setLimits] = useState<Partial<DietLimits>>(dietLimits);
  const [showIncompleteFeedsDialog, setShowIncompleteFeedsDialog] = useState(false);
  const [incompleteFeedNames, setIncompleteFeedNames] = useState<string[]>([]);

  // Custom Feed modal state
  const [showCustomFeedModal, setShowCustomFeedModal] = useState(false);
  const [customFeedForm, setCustomFeedForm] = useState(EMPTY_CUSTOM);
  const [customFeedTypes, setCustomFeedTypes] = useState<string[]>([]);
  const [customFeedCategories, setCustomFeedCategories] = useState<string[]>([]);
  const [loadingCustomTypes, setLoadingCustomTypes] = useState(false);
  const [loadingCustomCats, setLoadingCustomCats] = useState(false);
  const [isSavingCustom, setIsSavingCustom] = useState(false);

  const openCustomFeedModal = async () => {
    setCustomFeedForm(EMPTY_CUSTOM);
    setCustomFeedTypes([]);
    setCustomFeedCategories([]);
    if (!user?.country_id || !user?.id) {
      showSnackbar("Country info missing. Please update your profile.", "error");
      return;
    }
    setShowCustomFeedModal(true);
    setLoadingCustomTypes(true);
    try {
      const res = await getFeedTypes(user.country_id, user.id);
      const data = res.data;
      setCustomFeedTypes(Array.isArray(data) ? data : []);
    } catch {
      showSnackbar("Could not load feed types", "error");
    } finally {
      setLoadingCustomTypes(false);
    }
  };

  const handleCustomTypeChange = async (feedType: string) => {
    setCustomFeedForm((p) => ({ ...p, feed_type: feedType, feed_category: "" }));
    setCustomFeedCategories([]);
    if (!feedType || !user?.country_id || !user?.id) return;
    setLoadingCustomCats(true);
    try {
      const res = await getFeedCategories(feedType, user.country_id, user.id);
      const data = res.data;
      const names: string[] = (Array.isArray(data) ? data : data?.unique_feed_categories ?? []).filter(Boolean);
      setCustomFeedCategories(names);
    } catch {
      showSnackbar("Could not load categories", "error");
    } finally {
      setLoadingCustomCats(false);
    }
  };

  const handleSaveCustomFeed = async () => {
    if (!user?.id || !user?.country_id) return;
    if (!customFeedForm.feed_name.trim() || !customFeedForm.feed_type) {
      showSnackbar("Feed name and type are required", "error");
      return;
    }
    setIsSavingCustom(true);
    try {
      const feedDetails = {
        feed_name: customFeedForm.feed_name.trim(),
        feed_type: customFeedForm.feed_type,
        feed_category: customFeedForm.feed_category,
        country_code: user.country_code ?? "",
        country_name: user.country ?? "",
        fd_dm: customFeedForm.fd_dm ? Number(customFeedForm.fd_dm) : null,
        fd_cp: customFeedForm.fd_cp ? Number(customFeedForm.fd_cp) : null,
        fd_ee: customFeedForm.fd_ee ? Number(customFeedForm.fd_ee) : null,
        fd_cf: customFeedForm.fd_cf ? Number(customFeedForm.fd_cf) : null,
        fd_ash: customFeedForm.fd_ash ? Number(customFeedForm.fd_ash) : null,
        fd_ndf: customFeedForm.fd_ndf ? Number(customFeedForm.fd_ndf) : null,
        fd_adf: customFeedForm.fd_adf ? Number(customFeedForm.fd_adf) : null,
        fd_ca: customFeedForm.fd_ca ? Number(customFeedForm.fd_ca) : null,
        fd_p: customFeedForm.fd_p ? Number(customFeedForm.fd_p) : null,
        fd_st: customFeedForm.fd_st ? Number(customFeedForm.fd_st) : null,
        fd_adin: customFeedForm.fd_adin ? Number(customFeedForm.fd_adin) : null,
        fd_cellulose: customFeedForm.fd_cellulose ? Number(customFeedForm.fd_cellulose) : null,
        fd_hemicellulose: customFeedForm.fd_hemicellulose ? Number(customFeedForm.fd_hemicellulose) : null,
        fd_lg: customFeedForm.fd_lg ? Number(customFeedForm.fd_lg) : null,
        fd_ndin: customFeedForm.fd_ndin ? Number(customFeedForm.fd_ndin) : null,
        nfe_pct: customFeedForm.nfe_pct ? Number(customFeedForm.nfe_pct) : null,
        fd_npn_cp: customFeedForm.fd_npn_cp ? Number(customFeedForm.fd_npn_cp) : null,
      };

      // Check if it already exists
      let isUpdate = false;
      let existingFeedId = "";
      try {
        const checkRes = await checkInsertOrUpdate(user.country_id, customFeedForm.feed_name.trim(), user.id);
        const checkData = checkRes.data;
        isUpdate = !(checkData?.insert_feed ?? true);
        existingFeedId = checkData?.feed_details?.feed_id ?? "";
      } catch {
        // assume new feed
      }

      if (isUpdate && existingFeedId) {
        await updateCustomFeed({
          country_id: user.country_id,
          user_id: user.id,
          feed_id: existingFeedId,
          feed_insert: false,
          feed_details: feedDetails,
        });
        showSnackbar("Custom feed updated!", "success");
      } else {
        await insertCustomFeed({
          country_id: user.country_id,
          user_id: user.id,
          feed_insert: true,
          feed_details: feedDetails,
        });
        showSnackbar("Custom feed saved! It will appear in the feed list.", "success");
      }
      setShowCustomFeedModal(false);
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Failed to save custom feed", "error");
    } finally {
      setIsSavingCustom(false);
    }
  };

  const isEvaluation = feedSelectionType === "evaluation";

  const addFeed = () => {
    const updated = [...items, createFeedItem()];
    setItems(updated);
    setFeedSelections(updated);
  };

  const updateItem = (id: string, updates: Partial<FeedItem>) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    setItems(updated);
    setFeedSelections(updated);
  };

  const deleteItem = (id: string) => {
    if (items.length === 1) {
      showSnackbar("At least one feed item is required", "info");
      return;
    }
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    setFeedSelections(updated);
  };

  const isValid = () => {
    if (!cattleInfo) return false;
    return items.some(
      (item) =>
        item.feed_uuid !== null &&
        item.feed_type_id !== null &&
        item.category_id !== null &&
        item.price_per_kg !== null &&
        (!isEvaluation || item.quantity_kg !== null)
    );
  };

  const handleGenerateClick = () => {
    const incomplete = items
      .filter(
        (item) =>
          (item.feed_type_name || item.category_name) &&
          !(
            item.feed_uuid !== null &&
            item.price_per_kg !== null &&
            (!isEvaluation || item.quantity_kg !== null)
          )
      )
      .map((item) => item.feed_type_name || item.sub_category_name || `Feed ${items.indexOf(item) + 1}`);
    if (incomplete.length > 0) {
      setIncompleteFeedNames(incomplete);
      setShowIncompleteFeedsDialog(true);
    } else {
      generateReport();
    }
  };

  const generateReport = async () => {
    if (!cattleInfo || !user) return;
    setIsLoading(true);
    try {
      let res;
      const validItems = items.filter(
        (item) => item.feed_uuid !== null && item.price_per_kg !== null
      );

      const simulationId = cattleInfo.simulation_name;
      const cattlePayload = toCattleInfoPayload(cattleInfo);

      if (isEvaluation) {
        res = await evaluateDiet({
          user_id: user.id,
          country_id: cattleInfo.country_id,
          currency: user.currency || "USD",
          simulation_id: simulationId,
          cattle_info: cattlePayload,
          feed_evaluation: validItems.map((item) => ({
            feed_id: item.feed_uuid!,
            quantity_as_fed: item.quantity_kg ?? 0,
            price_per_kg: item.price_per_kg!,
          })),
        });
        setReportData({ ...res.data, mode: "evaluation" });
      } else {
        res = await recommendDiet({
          user_id: user.id,
          country_id: cattleInfo.country_id,
          simulation_id: simulationId,
          cattle_info: cattlePayload,
          feed_selection: validItems.map((item) => ({
            feed_id: item.feed_uuid!,
            price_per_kg: item.price_per_kg!,
          })),
          // Android always sends base_thresholds; merge user limits over defaults
          base_thresholds: { ...DEFAULT_BASE_THRESHOLDS, ...limits },
        });
        setReportData({ ...res.data, mode: "recommendation" });
      }
      setDietLimits(limits);
      router.push("/report");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate report";
      showSnackbar(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const updateLimit = (key: keyof DietLimits, val: string) => {
    setLimits((prev) => {
      const next = { ...prev };
      if (val) {
        next[key] = Number(val);
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const btnBase = {
    fontFamily: "Nunito, sans-serif",
    fontWeight: 700,
    fontSize: 16,
    borderRadius: 12,
    padding: "10px 16px",
    cursor: "pointer",
    transition: "all 0.15s",
  } as const;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar type="back" title="Feed Selection" onBack={() => router.back()} />

      {/* Custom buttons row */}
      <div className="flex gap-3 px-4 pt-4">
        <button
          onClick={() => setShowLimitsModal(true)}
          disabled={isEvaluation}
          style={{
            ...btnBase,
            flex: 1,
            backgroundColor: "transparent",
            color: isEvaluation ? "#999999" : "#064E3B",
            border: `2px solid ${isEvaluation ? "#D3D3D3" : "#064E3B"}`,
          }}
        >
          Custom Diet Limits
        </button>
        <button
          onClick={openCustomFeedModal}
          style={{
            ...btnBase,
            flex: 1,
            backgroundColor: "#064E3B",
            color: "white",
            border: "none",
          }}
        >
          Custom Feed
        </button>
      </div>

      {/* Radio group: Diet Recommendation / Diet Evaluation */}
      <div className="flex items-center gap-6 px-5 pt-4 pb-1">
        {(["recommendation", "evaluation"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFeedSelectionType(mode)}
            className="flex items-center gap-2"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {/* Radio button */}
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: `2px solid ${feedSelectionType === mode ? "#064E3B" : "#E2E8F0"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {feedSelectionType === mode && (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "#064E3B",
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontFamily: "Nunito, sans-serif",
                fontSize: 14,
                fontWeight: feedSelectionType === mode ? 700 : 400,
                color: feedSelectionType === mode ? "#064E3B" : "#6D6D6D",
                whiteSpace: "nowrap",
              }}
            >
              {mode === "recommendation" ? "Diet Recommendation" : "Diet Evaluation"}
            </span>
          </button>
        ))}
      </div>

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto px-3 pt-2" style={{ paddingBottom: 100 }}>
        <div className="space-y-3">
          {items.map((item, index) => (
            <FeedRow
              key={item.id}
              item={item}
              index={index}
              showQuantity={isEvaluation}
              feedTypeLocked={index === 0 && !isEvaluation}
              currencySymbol={currencySymbol}
              onUpdate={updateItem}
              onDelete={deleteItem}
            />
          ))}
        </div>

        {/* Add More Feed button (dashed border) */}
        <button
          onClick={addFeed}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl mt-3 mb-3"
          style={{
            border: "2px dashed #064E3B",
            backgroundColor: "transparent",
            color: "#064E3B",
            fontFamily: "Nunito, sans-serif",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          <IcAddFeed size={20} color="#064E3B" />
          Add More Feed
        </button>
      </div>

      {/* Fixed bottom Generate button */}
      <div
        className="px-4 py-4"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: "min(100vw, 480px)",
          backgroundColor: "#FFFFFF",
          borderTop: "1px solid #E2E8F0",
          zIndex: 30,
        }}
      >
        <button
          onClick={handleGenerateClick}
          disabled={!isValid() || isLoading}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-base"
          style={{
            backgroundColor: isValid() && !isLoading ? "#064E3B" : "#D3D3D3",
            color: isValid() && !isLoading ? "#FFFFFF" : "#999999",
            border: "none",
            fontFamily: "Nunito, sans-serif",
            cursor: isValid() && !isLoading ? "pointer" : "not-allowed",
            transition: "background-color 0.2s",
          }}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
              </svg>
              <span>Calculating...</span>
            </>
          ) : (
            <>
              <span>{isEvaluation ? "Get Evaluation" : "Generate Recommendation"}</span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4.5 9H13.5M10 5.5L13.5 9L10 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>
      </div>

      {/* Custom Feed Modal */}
      {showCustomFeedModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCustomFeedModal(false); }}
        >
          <div
            className="bg-white rounded-t-2xl px-5 pt-5 pb-8 overflow-y-auto"
            style={{ maxHeight: "90vh", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>Add Custom Feed</h3>
              <button onClick={() => setShowCustomFeedModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="#6D6D6D" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            <p className="text-xs mb-4" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Add a custom feed item with its nutritional composition. It will be available in your feed list.
            </p>

            {/* Feed Type */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Feed Type *</p>
            <div className="relative mb-3">
              {loadingCustomTypes ? (
                <div className="h-11 rounded-xl shimmer" />
              ) : (
                <>
                  <select
                    value={customFeedForm.feed_type}
                    onChange={(e) => handleCustomTypeChange(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none appearance-none pr-8"
                    style={{ backgroundColor: "#F1F5F9", color: customFeedForm.feed_type ? "#231F20" : "#999", fontFamily: "Nunito, sans-serif" }}
                  >
                    <option value="">Select feed type...</option>
                    {customFeedTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                </>
              )}
            </div>

            {/* Feed Category */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Feed Category</p>
            <div className="relative mb-3">
              {loadingCustomCats ? (
                <div className="h-11 rounded-xl shimmer" />
              ) : (
                <>
                  <select
                    value={customFeedForm.feed_category}
                    onChange={(e) => setCustomFeedForm((p) => ({ ...p, feed_category: e.target.value }))}
                    disabled={!customFeedForm.feed_type}
                    className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none appearance-none pr-8"
                    style={{ backgroundColor: "#F1F5F9", color: customFeedForm.feed_category ? "#231F20" : "#999", fontFamily: "Nunito, sans-serif", opacity: !customFeedForm.feed_type ? 0.5 : 1 }}
                  >
                    <option value="">{!customFeedForm.feed_type ? "Select type first" : "Select category..."}</option>
                    {customFeedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                </>
              )}
            </div>

            {/* Feed Name */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Feed Name *</p>
            <input
              type="text"
              value={customFeedForm.feed_name}
              onChange={(e) => setCustomFeedForm((p) => ({ ...p, feed_name: e.target.value }))}
              placeholder="e.g. Local Maize Bran"
              className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark mb-4"
              style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
            />

            {/* Nutrients */}
            <p className="text-xs font-bold uppercase mb-3" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>Nutrient Composition (%) — optional</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <CustomFeedNutrientInput label="Dry Matter (DM)" value={customFeedForm.fd_dm} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_dm: v }))} />
              <CustomFeedNutrientInput label="Crude Protein (CP)" value={customFeedForm.fd_cp} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_cp: v }))} />
              <CustomFeedNutrientInput label="Ether Extract (EE)" value={customFeedForm.fd_ee} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_ee: v }))} />
              <CustomFeedNutrientInput label="Crude Fiber (CF)" value={customFeedForm.fd_cf} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_cf: v }))} />
              <CustomFeedNutrientInput label="Ash" value={customFeedForm.fd_ash} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_ash: v }))} />
              <CustomFeedNutrientInput label="NDF" value={customFeedForm.fd_ndf} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_ndf: v }))} />
              <CustomFeedNutrientInput label="ADF" value={customFeedForm.fd_adf} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_adf: v }))} />
              <CustomFeedNutrientInput label="Calcium (Ca)" value={customFeedForm.fd_ca} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_ca: v }))} />
              <CustomFeedNutrientInput label="Phosphorus (P)" value={customFeedForm.fd_p} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_p: v }))} />
              <CustomFeedNutrientInput label="Starch (ST)" value={customFeedForm.fd_st} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_st: v }))} />
              <CustomFeedNutrientInput label="ADIN" value={customFeedForm.fd_adin} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_adin: v }))} />
              <CustomFeedNutrientInput label="Cellulose" value={customFeedForm.fd_cellulose} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_cellulose: v }))} />
              <CustomFeedNutrientInput label="Hemicellulose" value={customFeedForm.fd_hemicellulose} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_hemicellulose: v }))} />
              <CustomFeedNutrientInput label="Lignin (LG)" value={customFeedForm.fd_lg} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_lg: v }))} />
              <CustomFeedNutrientInput label="NDIN" value={customFeedForm.fd_ndin} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_ndin: v }))} />
              <CustomFeedNutrientInput label="NFE (%)" value={customFeedForm.nfe_pct} onChange={(v) => setCustomFeedForm((p) => ({ ...p, nfe_pct: v }))} />
              <CustomFeedNutrientInput label="NPN Crude Protein" value={customFeedForm.fd_npn_cp} onChange={(v) => setCustomFeedForm((p) => ({ ...p, fd_npn_cp: v }))} />
            </div>

            <button
              onClick={handleSaveCustomFeed}
              disabled={!customFeedForm.feed_name.trim() || !customFeedForm.feed_type || isSavingCustom}
              className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
              style={{
                backgroundColor: customFeedForm.feed_name.trim() && customFeedForm.feed_type && !isSavingCustom ? "#064E3B" : "#D3D3D3",
                color: customFeedForm.feed_name.trim() && customFeedForm.feed_type && !isSavingCustom ? "white" : "#999",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: customFeedForm.feed_name.trim() && customFeedForm.feed_type && !isSavingCustom ? "pointer" : "not-allowed",
              }}
            >
              {isSavingCustom ? (
                <><svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" /></svg>Saving...</>
              ) : "Save Custom Feed"}
            </button>
          </div>
        </div>
      )}

      {/* Incomplete Feeds Dialog */}
      {showIncompleteFeedsDialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white w-full max-w-xs" style={{ borderRadius: 16, paddingBottom: 30 }}>
            {/* Orange warning icon pill */}
            <div className="flex justify-center" style={{ marginTop: 30 }}>
              <div
                className="flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,152,0,0.15)", borderRadius: 60, padding: 14 }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#FF9800" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M12 9v4M12 17h.01" stroke="#FF9800" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            {/* Title */}
            <p
              className="text-center font-bold"
              style={{ color: "#064E3B", fontSize: 20, fontFamily: "Nunito, sans-serif", margin: "20px 16px 0" }}
            >
              Incomplete Feeds
            </p>
            {/* Description */}
            <p
              className="text-center"
              style={{ color: "#6D6D6D", fontSize: 16, fontFamily: "Nunito, sans-serif", margin: "16px 16px 0", lineHeight: 1.5 }}
            >
              The following feeds have missing nutritional data and will be automatically discarded from the formulation:
            </p>
            {/* Honeydew card with feed names */}
            <div
              style={{
                backgroundColor: "#F0FDF4",
                borderRadius: 20,
                padding: 16,
                margin: "16px 16px 0",
                border: "1px solid rgba(5,188,109,0.15)",
              }}
            >
              {incompleteFeedNames.map((name, i) => (
                <p
                  key={i}
                  className="font-bold"
                  style={{
                    color: "#1CA069",
                    fontFamily: "Nunito, sans-serif",
                    marginTop: i > 0 ? 6 : 0,
                    lineHeight: 1.6,
                  }}
                >
                  • {name}
                </p>
              ))}
            </div>
            {/* Proceed question */}
            <p
              className="text-center"
              style={{ color: "#6D6D6D", fontSize: 16, fontFamily: "Nunito, sans-serif", margin: "30px 12px 0" }}
            >
              Would you like to proceed?
            </p>
            {/* No, Review button */}
            <button
              onClick={() => setShowIncompleteFeedsDialog(false)}
              className="font-bold"
              style={{
                display: "block",
                width: "calc(100% - 32px)",
                backgroundColor: "#EF6464",
                color: "white",
                borderRadius: 60,
                padding: "14px 0",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                fontSize: 16,
                cursor: "pointer",
                margin: "30px 16px 0",
              }}
            >
              No, Review
            </button>
            {/* Yes, Proceed button */}
            <button
              onClick={() => { setShowIncompleteFeedsDialog(false); generateReport(); }}
              className="font-bold"
              style={{
                display: "block",
                width: "calc(100% - 32px)",
                backgroundColor: "#064E3B",
                color: "white",
                borderRadius: 60,
                padding: "14px 0",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                fontSize: 16,
                cursor: "pointer",
                margin: "20px 16px 0",
              }}
            >
              Yes, Proceed
            </button>
          </div>
        </div>
      )}

      {/* Custom Diet Limits Modal (bottom sheet) */}
      {showLimitsModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLimitsModal(false); }}
        >
          <div
            className="bg-white rounded-t-2xl px-5 pt-5 pb-8"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                className="text-base font-bold"
                style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
              >
                Custom Diet Limits
              </h3>
              <button
                onClick={() => setShowLimitsModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5L15 15M15 5L5 15" stroke="#6D6D6D" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {LIMIT_ROWS.map(({ label, key }) => (
              <div key={key} className="mb-4">
                <p
                  className="text-xs font-bold uppercase mb-2"
                  style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                >
                  {label}
                </p>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="—"
                  value={limits[key] ?? ""}
                  onChange={(e) => updateLimit(key, e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                  style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                />
              </div>
            ))}

            <button
              onClick={() => {
                setDietLimits(limits);
                setShowLimitsModal(false);
              }}
              className="w-full py-4 rounded-xl font-bold text-base mt-2"
              style={{
                backgroundColor: "#064E3B",
                color: "white",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: "pointer",
              }}
            >
              Apply Limits
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

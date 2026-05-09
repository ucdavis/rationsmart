"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  getAdminFeedTypes,
  getAdminFeedCategories,
  getAdminFeeds,
  addAdminFeed,
  updateAdminFeed,
  deleteAdminFeed,
  addAdminFeedCategory,
  deleteAdminFeedCategory,
  addAdminFeedType,
  deleteAdminFeedType,
  getCountries,
} from "@/lib/api";
import Toolbar from "@/components/Toolbar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminFeedType {
  id: string;
  type_name?: string;
  name?: string;
}

interface AdminFeedCategory {
  id: string;
  category_name?: string;
  name?: string;
  feed_type?: { id: string; type_name?: string } | string;
  feed_type_id?: string;
}

interface AdminFeed {
  feed_id?: string;
  fd_name?: string;
  fd_type?: string;
  fd_category?: string;
  fd_country_name?: string;
  fd_country_id?: string;
  fd_dm?: number;
  fd_cp?: number;
  fd_ee?: number;
  fd_cf?: number;
  fd_ash?: number;
  fd_ndf?: number;
  fd_adf?: number;
  fd_ca?: number;
  fd_p?: number;
  fd_st?: number;
  fd_code?: string;
  fd_country_cd?: string;
  fd_cellulose?: number | string;
  fd_hemicellulose?: number | string;
  fd_lg?: number | string;
  fd_ndin?: number | string;
  fd_nfe?: number | string;
  fd_npn_cp?: number | string;
  fd_adin?: number | string;
  fd_ipb_local_lab?: string;
  fd_orginin?: string;
  fd_season?: string;
}

interface Country {
  id: string | number;
  name: string;
  country_code?: string;
}

type TabType = "feeds" | "types" | "categories";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="mx-3 my-2 rounded-2xl bg-white p-4 space-y-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
      <div className="h-4 w-40 rounded-full shimmer" />
      <div className="h-3 w-28 rounded-full shimmer" />
    </div>
  );
}

function NutrientInput({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
        {label}{required && " *"}
      </p>
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

const emptyFeedForm = {
  fd_name: "",
  fd_type: "",
  fd_category: "",
  fd_country_name: "",
  fd_country_cd: "",
  fd_country_id: "",
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
  fd_code: "",
  fd_cellulose: "",
  fd_hemicellulose: "",
  fd_lg: "",
  fd_ndin: "",
  fd_nfe: "",
  fd_npn_cp: "",
  fd_adin: "",
  fd_ipb_local_lab: "",
  fd_orginin: "",
  fd_season: "",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminFeedsPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [tab, setTab] = useState<TabType>("feeds");
  const [feedTypes, setFeedTypes] = useState<AdminFeedType[]>([]);
  const [feedCategories, setFeedCategories] = useState<AdminFeedCategory[]>([]);
  const [feeds, setFeeds] = useState<AdminFeed[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCountry, setFilterCountry] = useState("");

  // Feed modal state
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [editingFeed, setEditingFeed] = useState<AdminFeed | null>(null);
  const [feedForm, setFeedForm] = useState(emptyFeedForm);
  const [isSavingFeed, setIsSavingFeed] = useState(false);
  const [deletingFeedId, setDeletingFeedId] = useState<string | null>(null);
  const [confirmDeleteFeed, setConfirmDeleteFeed] = useState<AdminFeed | null>(null);

  // Category modal state
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatTypeId, setNewCatTypeId] = useState("");
  const [isSavingCat, setIsSavingCat] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<AdminFeedCategory | null>(null);

  // Type modal state
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [isSavingType, setIsSavingType] = useState(false);
  const [deletingTypeId, setDeletingTypeId] = useState<string | null>(null);
  const [confirmDeleteType, setConfirmDeleteType] = useState<AdminFeedType | null>(null);

  const getName = (t: AdminFeedType) => t.type_name ?? t.name ?? "";
  const getCatName = (c: AdminFeedCategory) => c.category_name ?? c.name ?? "";
  const getFeedTypeName = (c: AdminFeedCategory) => {
    if (!c.feed_type) return "";
    if (typeof c.feed_type === "string") return c.feed_type;
    return c.feed_type.type_name ?? "";
  };

  const loadAll = useCallback(() => {
    if (!user?.id) return;
    setIsLoading(true);
    Promise.all([
      getAdminFeedTypes(user.id),
      getAdminFeedCategories(user.id),
      getAdminFeeds(user.id, 1, 100),
      getCountries(),
    ])
      .then(([typesRes, catsRes, feedsRes, countriesRes]) => {
        setFeedTypes(Array.isArray(typesRes.data) ? typesRes.data : typesRes.data?.feed_types ?? []);
        setFeedCategories(Array.isArray(catsRes.data) ? catsRes.data : catsRes.data?.categories ?? []);
        const fd = feedsRes.data;
        setFeeds(Array.isArray(fd) ? fd : fd?.feeds ?? fd?.items ?? []);
        setCountries(Array.isArray(countriesRes.data) ? countriesRes.data : []);
      })
      .catch(() => showSnackbar("Could not load feed data", "error"))
      .finally(() => setIsLoading(false));
  }, [user?.id, showSnackbar]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredFeeds = feeds.filter((f) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const textMatch =
        f.fd_name?.toLowerCase().includes(q) ||
        f.fd_type?.toLowerCase().includes(q) ||
        f.fd_category?.toLowerCase().includes(q) ||
        f.fd_country_name?.toLowerCase().includes(q);
      if (!textMatch) return false;
    }
    if (filterType && f.fd_type !== filterType) return false;
    if (filterCategory && f.fd_category !== filterCategory) return false;
    if (filterCountry && f.fd_country_name !== filterCountry) return false;
    return true;
  });

  // ── Feed CRUD ──────────────────────────────────────────────────────────────

  const openAddFeed = () => {
    setEditingFeed(null);
    setFeedForm(emptyFeedForm);
    setShowFeedModal(true);
  };

  const openEditFeed = (feed: AdminFeed) => {
    setEditingFeed(feed);
    setFeedForm({
      fd_name: feed.fd_name ?? "",
      fd_type: feed.fd_type ?? "",
      fd_category: feed.fd_category ?? "",
      fd_country_name: feed.fd_country_name ?? "",
      fd_country_cd: feed.fd_country_cd ?? "",
      fd_country_id: feed.fd_country_id ?? "",
      fd_dm: String(feed.fd_dm ?? ""),
      fd_cp: String(feed.fd_cp ?? ""),
      fd_ee: String(feed.fd_ee ?? ""),
      fd_cf: String(feed.fd_cf ?? ""),
      fd_ash: String(feed.fd_ash ?? ""),
      fd_ndf: String(feed.fd_ndf ?? ""),
      fd_adf: String(feed.fd_adf ?? ""),
      fd_ca: String(feed.fd_ca ?? ""),
      fd_p: String(feed.fd_p ?? ""),
      fd_st: String(feed.fd_st ?? ""),
      fd_code: feed.fd_code ?? "",
      fd_cellulose: String(feed.fd_cellulose ?? ""),
      fd_hemicellulose: String(feed.fd_hemicellulose ?? ""),
      fd_lg: String(feed.fd_lg ?? ""),
      fd_ndin: String(feed.fd_ndin ?? ""),
      fd_nfe: String(feed.fd_nfe ?? ""),
      fd_npn_cp: String(feed.fd_npn_cp ?? ""),
      fd_adin: String(feed.fd_adin ?? ""),
      fd_ipb_local_lab: feed.fd_ipb_local_lab ?? "",
      fd_orginin: feed.fd_orginin ?? "",
      fd_season: feed.fd_season ?? "",
    });
    setShowFeedModal(true);
  };

  const handleSaveFeed = async () => {
    if (!user?.id || !feedForm.fd_name.trim() || !feedForm.fd_type || !feedForm.fd_country_name) {
      showSnackbar("Name, Type and Country are required", "error");
      return;
    }
    setIsSavingFeed(true);
    const body = {
      fd_name: feedForm.fd_name.trim(),
      fd_type: feedForm.fd_type,
      fd_category: feedForm.fd_category,
      fd_country_name: feedForm.fd_country_name,
      fd_country_cd: feedForm.fd_country_cd,
      ...(feedForm.fd_country_id ? { fd_country_id: feedForm.fd_country_id } : {}),
      fd_code: feedForm.fd_code,
      fd_dm: feedForm.fd_dm ? Number(feedForm.fd_dm) : 0,
      fd_cp: feedForm.fd_cp ? Number(feedForm.fd_cp) : 0,
      fd_ee: feedForm.fd_ee ? Number(feedForm.fd_ee) : 0,
      fd_cf: feedForm.fd_cf ? Number(feedForm.fd_cf) : 0,
      fd_ash: feedForm.fd_ash ? Number(feedForm.fd_ash) : 0,
      fd_ndf: feedForm.fd_ndf ? Number(feedForm.fd_ndf) : 0,
      fd_adf: feedForm.fd_adf ? Number(feedForm.fd_adf) : 0,
      fd_ca: feedForm.fd_ca ? Number(feedForm.fd_ca) : 0,
      fd_p: feedForm.fd_p ? Number(feedForm.fd_p) : 0,
      fd_st: feedForm.fd_st ? Number(feedForm.fd_st) : 0,
      fd_cellulose: feedForm.fd_cellulose ? Number(feedForm.fd_cellulose) : null,
      fd_hemicellulose: feedForm.fd_hemicellulose ? Number(feedForm.fd_hemicellulose) : null,
      fd_lg: feedForm.fd_lg ? Number(feedForm.fd_lg) : null,
      fd_ndin: feedForm.fd_ndin ? Number(feedForm.fd_ndin) : null,
      fd_nfe: feedForm.fd_nfe ? Number(feedForm.fd_nfe) : null,
      fd_npn_cp: feedForm.fd_npn_cp ? Number(feedForm.fd_npn_cp) : null,
      fd_adin: feedForm.fd_adin ? Number(feedForm.fd_adin) : null,
      fd_ipb_local_lab: feedForm.fd_ipb_local_lab || null,
      fd_orginin: feedForm.fd_orginin || null,
      fd_season: feedForm.fd_season || null,
    };
    try {
      if (editingFeed?.feed_id) {
        await updateAdminFeed(editingFeed.feed_id, user.id, body);
        showSnackbar("Feed updated successfully", "success");
      } else {
        await addAdminFeed(user.id, body);
        showSnackbar("Feed added successfully", "success");
      }
      setShowFeedModal(false);
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setIsSavingFeed(false);
    }
  };

  const handleDeleteFeed = async (feed: AdminFeed) => {
    if (!user?.id || !feed.feed_id) return;
    setDeletingFeedId(feed.feed_id);
    try {
      await deleteAdminFeed(feed.feed_id, user.id);
      showSnackbar("Feed deleted", "success");
      setConfirmDeleteFeed(null);
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setDeletingFeedId(null);
    }
  };

  // ── Category CRUD ──────────────────────────────────────────────────────────

  const handleSaveCategory = async () => {
    if (!user?.id || !newCatName.trim() || !newCatTypeId) {
      showSnackbar("Category name and type are required", "error");
      return;
    }
    setIsSavingCat(true);
    try {
      await addAdminFeedCategory(user.id, { category_name: newCatName.trim(), feed_type_id: newCatTypeId });
      showSnackbar("Category added successfully", "success");
      setShowCatModal(false);
      setNewCatName("");
      setNewCatTypeId("");
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setIsSavingCat(false);
    }
  };

  const handleDeleteCategory = async (cat: AdminFeedCategory) => {
    if (!user?.id || !cat.id) return;
    setDeletingCatId(cat.id);
    try {
      await deleteAdminFeedCategory(cat.id, user.id);
      showSnackbar("Category deleted", "success");
      setConfirmDeleteCat(null);
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setDeletingCatId(null);
    }
  };

  // ── Type CRUD ──────────────────────────────────────────────────────────────

  const handleSaveType = async () => {
    if (!user?.id || !newTypeName.trim()) {
      showSnackbar("Type name is required", "error");
      return;
    }
    setIsSavingType(true);
    try {
      await addAdminFeedType(user.id, { type_name: newTypeName.trim() });
      showSnackbar("Feed type added successfully", "success");
      setShowTypeModal(false);
      setNewTypeName("");
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setIsSavingType(false);
    }
  };

  const handleDeleteType = async (type: AdminFeedType) => {
    if (!user?.id || !type.id) return;
    setDeletingTypeId(type.id);
    try {
      await deleteAdminFeedType(type.id, user.id);
      showSnackbar("Feed type deleted", "success");
      setConfirmDeleteType(null);
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setDeletingTypeId(null);
    }
  };

  const isFeedFormValid = feedForm.fd_name.trim() !== "" && feedForm.fd_type !== "" && feedForm.fd_country_name !== "";

  const btnStyle = (active: boolean) => ({
    flex: 1,
    padding: "10px 0",
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 13,
    fontFamily: "Nunito, sans-serif",
    cursor: "pointer",
    border: "2px solid #064E3B",
    backgroundColor: active ? "#064E3B" : "white",
    color: active ? "white" : "#064E3B",
    transition: "all 0.15s",
  } as const);

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Feed Management" onBack={() => router.back()} />

      {/* Tabs */}
      <div className="flex px-3 pt-3 gap-2">
        {(["feeds", "types", "categories"] as TabType[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={btnStyle(tab === t)}>
            {t === "feeds" ? "Feeds" : t === "types" ? "Types" : "Categories"}
          </button>
        ))}
      </div>

      {/* ── FEEDS TAB ── */}
      {tab === "feeds" && (
        <>
          {/* Search + Add */}
          <div className="flex gap-2 px-3 pt-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search feeds..."
                className="w-full rounded-2xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
              />
            </div>
            <button
              onClick={openAddFeed}
              className="flex items-center justify-center rounded-2xl px-4 font-bold text-sm text-white"
              style={{ backgroundColor: "#064E3B", border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif", whiteSpace: "nowrap" }}
            >
              + Add
            </button>
          </div>
          {/* Filter row */}
          <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-xl px-3 py-2 text-xs font-bold border-none focus:outline-none appearance-none flex-shrink-0"
              style={{ backgroundColor: filterType ? "#064E3B" : "#F1F5F9", color: filterType ? "white" : "#6D6D6D", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
            >
              <option value="">All Types</option>
              {feedTypes.map((ft) => (
                <option key={ft.id} value={getName(ft)}>{getName(ft)}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-xl px-3 py-2 text-xs font-bold border-none focus:outline-none appearance-none flex-shrink-0"
              style={{ backgroundColor: filterCategory ? "#064E3B" : "#F1F5F9", color: filterCategory ? "white" : "#6D6D6D", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
            >
              <option value="">All Categories</option>
              {feedCategories.map((fc) => (
                <option key={fc.id} value={getCatName(fc)}>{getCatName(fc)}</option>
              ))}
            </select>
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="rounded-xl px-3 py-2 text-xs font-bold border-none focus:outline-none appearance-none flex-shrink-0"
              style={{ backgroundColor: filterCountry ? "#064E3B" : "#F1F5F9", color: filterCountry ? "white" : "#6D6D6D", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
            >
              <option value="">All Countries</option>
              {Array.from(new Set(feeds.map((f) => f.fd_country_name).filter(Boolean))).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {(filterType || filterCategory || filterCountry) && (
              <button
                onClick={() => { setFilterType(""); setFilterCategory(""); setFilterCountry(""); }}
                className="rounded-xl px-3 py-2 text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: "rgba(228,74,74,0.2)", color: "#E44A4A", border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif" }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pt-2 pb-6">
            {isLoading ? (
              [0,1,2,3].map((i) => <SkeletonCard key={i} />)
            ) : filteredFeeds.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-base" style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}>
                  {searchQuery ? "No feeds match your search" : "No feeds found"}
                </p>
              </div>
            ) : (
              filteredFeeds.map((f, idx) => (
                <div
                  key={f.feed_id ?? idx}
                  className="mx-3 my-2 rounded-2xl bg-white p-4"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                        {f.fd_name || "—"}
                      </p>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        {f.fd_type && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#F0FDF4", color: "#064E3B", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>
                            {f.fd_type}
                          </span>
                        )}
                        {f.fd_category && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#F1F5F9", color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>
                            {f.fd_category}
                          </span>
                        )}
                        {f.fd_country_name && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FFF8E1", color: "#F57F17", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>
                            {f.fd_country_name}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 mt-2 flex-wrap">
                        {f.fd_dm != null && <span className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>DM: {f.fd_dm}%</span>}
                        {f.fd_cp != null && <span className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>CP: {f.fd_cp}%</span>}
                        {f.fd_ee != null && <span className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>EE: {f.fd_ee}%</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-2">
                      <button
                        onClick={() => openEditFeed(f)}
                        className="flex items-center justify-center rounded-xl"
                        style={{ width: 34, height: 34, backgroundColor: "#F0FDF4", border: "none", cursor: "pointer" }}
                        aria-label="Edit feed"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M11 2L14 5L5 14H2V11L11 2Z" stroke="#064E3B" strokeWidth="1.6" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteFeed(f)}
                        disabled={deletingFeedId === f.feed_id}
                        className="flex items-center justify-center rounded-xl"
                        style={{ width: 34, height: 34, backgroundColor: "#FEC5BB", border: "none", cursor: "pointer" }}
                        aria-label="Delete feed"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M2 4h12M6 4V3h4v1M5 4v9h6V4H5Z" stroke="#E44A4A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── TYPES TAB ── */}
      {tab === "types" && (
        <>
          <div className="flex justify-end px-3 pt-3">
            <button
              onClick={() => { setNewTypeName(""); setShowTypeModal(true); }}
              className="px-4 py-2.5 rounded-2xl font-bold text-sm text-white"
              style={{ backgroundColor: "#064E3B", border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif" }}
            >
              + Add Type
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pt-2 pb-6">
            {isLoading ? [0,1,2].map((i) => <SkeletonCard key={i} />) : (
              feedTypes.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <p style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}>No feed types found</p>
                </div>
              ) : feedTypes.map((ft) => (
                <div key={ft.id} className="mx-3 my-2 rounded-2xl bg-white p-4 flex items-center justify-between" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                  <p className="text-sm font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{getName(ft)}</p>
                  <button
                    onClick={() => setConfirmDeleteType(ft)}
                    disabled={deletingTypeId === ft.id}
                    className="flex items-center justify-center rounded-xl"
                    style={{ width: 34, height: 34, backgroundColor: "#FEC5BB", border: "none", cursor: "pointer" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 4h12M6 4V3h4v1M5 4v9h6V4H5Z" stroke="#E44A4A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── CATEGORIES TAB ── */}
      {tab === "categories" && (
        <>
          <div className="flex justify-end px-3 pt-3">
            <button
              onClick={() => { setNewCatName(""); setNewCatTypeId(""); setShowCatModal(true); }}
              className="px-4 py-2.5 rounded-2xl font-bold text-sm text-white"
              style={{ backgroundColor: "#064E3B", border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif" }}
            >
              + Add Category
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pt-2 pb-6">
            {isLoading ? [0,1,2].map((i) => <SkeletonCard key={i} />) : (
              feedCategories.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <p style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}>No categories found</p>
                </div>
              ) : feedCategories.map((fc) => (
                <div key={fc.id} className="mx-3 my-2 rounded-2xl bg-white p-4 flex items-center justify-between" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>{getCatName(fc)}</p>
                    {getFeedTypeName(fc) && (
                      <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block" style={{ backgroundColor: "#F0FDF4", color: "#064E3B", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>
                        {getFeedTypeName(fc)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setConfirmDeleteCat(fc)}
                    disabled={deletingCatId === fc.id}
                    className="flex items-center justify-center rounded-xl"
                    style={{ width: 34, height: 34, backgroundColor: "#FEC5BB", border: "none", cursor: "pointer" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 4h12M6 4V3h4v1M5 4v9h6V4H5Z" stroke="#E44A4A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ══ ADD/EDIT FEED MODAL ══ */}
      {showFeedModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowFeedModal(false); }}
        >
          <div className="bg-white rounded-t-2xl px-4 pt-5 pb-8 overflow-y-auto" style={{ maxHeight: "90vh", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                {editingFeed ? "Edit Feed" : "Add Feed"}
              </h3>
              <button onClick={() => setShowFeedModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="#6D6D6D" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            {/* Required fields — Android cascade: Country → Feed Type → Category → Feed Name → Feed Code */}
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Country *</p>
                <div className="relative">
                  <select
                    value={feedForm.fd_country_name}
                    onChange={(e) => {
                      const c = countries.find((x) => x.name === e.target.value);
                      setFeedForm((p) => ({ ...p, fd_country_name: e.target.value, fd_country_cd: c?.country_code ?? "", fd_type: "", fd_category: "" }));
                    }}
                    className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none appearance-none pr-8"
                    style={{ backgroundColor: "#F1F5F9", color: feedForm.fd_country_name ? "#231F20" : "#999", fontFamily: "Nunito, sans-serif" }}
                  >
                    <option value="">Select country...</option>
                    {countries.map((c) => <option key={String(c.id)} value={c.name}>{c.name}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Feed Type *</p>
                <div className="relative">
                  <select
                    value={feedForm.fd_type}
                    disabled={!feedForm.fd_country_name}
                    onChange={(e) => setFeedForm((p) => ({ ...p, fd_type: e.target.value, fd_category: "" }))}
                    className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none appearance-none pr-8"
                    style={{ backgroundColor: feedForm.fd_country_name ? "#F1F5F9" : "#E8EDEB", color: feedForm.fd_type ? "#231F20" : "#999", fontFamily: "Nunito, sans-serif", opacity: !feedForm.fd_country_name ? 0.6 : 1 }}
                  >
                    <option value="">{!feedForm.fd_country_name ? "Select country first" : "Select type..."}</option>
                    {feedTypes.map((ft) => <option key={ft.id} value={getName(ft)}>{getName(ft)}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Category</p>
                <div className="relative">
                  <select
                    value={feedForm.fd_category}
                    disabled={!feedForm.fd_type}
                    onChange={(e) => setFeedForm((p) => ({ ...p, fd_category: e.target.value }))}
                    className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none appearance-none pr-8"
                    style={{ backgroundColor: feedForm.fd_type ? "#F1F5F9" : "#E8EDEB", color: feedForm.fd_category ? "#231F20" : "#999", fontFamily: "Nunito, sans-serif", opacity: !feedForm.fd_type ? 0.6 : 1 }}
                  >
                    <option value="">{!feedForm.fd_type ? "Select type first" : "Select category..."}</option>
                    {feedCategories
                      .filter((fc) => !feedForm.fd_type || getFeedTypeName(fc) === feedForm.fd_type)
                      .map((fc) => <option key={fc.id} value={getCatName(fc)}>{getCatName(fc)}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Feed Name *</p>
                <input
                  type="text"
                  value={feedForm.fd_name}
                  onChange={(e) => setFeedForm((p) => ({ ...p, fd_name: e.target.value }))}
                  placeholder="e.g. Maize Silage"
                  className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                  style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                />
              </div>

              <div>
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Feed Code</p>
                <input
                  type="text"
                  value={feedForm.fd_code}
                  onChange={(e) => setFeedForm((p) => ({ ...p, fd_code: e.target.value }))}
                  placeholder="e.g. MS001"
                  className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
                  style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                />
              </div>
            </div>

            {/* Nutrient fields */}
            <p className="text-xs font-bold uppercase mb-3" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>Nutrient Composition (%)</p>
            <div className="grid grid-cols-2 gap-3">
              <NutrientInput label="Dry Matter (DM)" value={feedForm.fd_dm} onChange={(v) => setFeedForm((p) => ({ ...p, fd_dm: v }))} />
              <NutrientInput label="Crude Protein (CP)" value={feedForm.fd_cp} onChange={(v) => setFeedForm((p) => ({ ...p, fd_cp: v }))} />
              <NutrientInput label="Ether Extract (EE)" value={feedForm.fd_ee} onChange={(v) => setFeedForm((p) => ({ ...p, fd_ee: v }))} />
              <NutrientInput label="Crude Fiber (CF)" value={feedForm.fd_cf} onChange={(v) => setFeedForm((p) => ({ ...p, fd_cf: v }))} />
              <NutrientInput label="Ash" value={feedForm.fd_ash} onChange={(v) => setFeedForm((p) => ({ ...p, fd_ash: v }))} />
              <NutrientInput label="NDF" value={feedForm.fd_ndf} onChange={(v) => setFeedForm((p) => ({ ...p, fd_ndf: v }))} />
              <NutrientInput label="ADF" value={feedForm.fd_adf} onChange={(v) => setFeedForm((p) => ({ ...p, fd_adf: v }))} />
              <NutrientInput label="Calcium (Ca)" value={feedForm.fd_ca} onChange={(v) => setFeedForm((p) => ({ ...p, fd_ca: v }))} />
              <NutrientInput label="Phosphorus (P)" value={feedForm.fd_p} onChange={(v) => setFeedForm((p) => ({ ...p, fd_p: v }))} />
              <NutrientInput label="Starch (ST)" value={feedForm.fd_st} onChange={(v) => setFeedForm((p) => ({ ...p, fd_st: v }))} />
              <NutrientInput label="Cellulose" value={feedForm.fd_cellulose} onChange={(v) => setFeedForm((p) => ({ ...p, fd_cellulose: v }))} />
              <NutrientInput label="Hemicellulose" value={feedForm.fd_hemicellulose} onChange={(v) => setFeedForm((p) => ({ ...p, fd_hemicellulose: v }))} />
              <NutrientInput label="Lignin" value={feedForm.fd_lg} onChange={(v) => setFeedForm((p) => ({ ...p, fd_lg: v }))} />
              <NutrientInput label="NDIN" value={feedForm.fd_ndin} onChange={(v) => setFeedForm((p) => ({ ...p, fd_ndin: v }))} />
              <NutrientInput label="NFE" value={feedForm.fd_nfe} onChange={(v) => setFeedForm((p) => ({ ...p, fd_nfe: v }))} />
              <NutrientInput label="NPN Crude Protein" value={feedForm.fd_npn_cp} onChange={(v) => setFeedForm((p) => ({ ...p, fd_npn_cp: v }))} />
              <NutrientInput label="ADIN" value={feedForm.fd_adin} onChange={(v) => setFeedForm((p) => ({ ...p, fd_adin: v }))} />
            </div>

            {/* Metadata fields */}
            <div className="space-y-3 mt-3">
              {[
                { label: "IPB Local Lab", key: "fd_ipb_local_lab" as const },
                { label: "Origin (Orginin)", key: "fd_orginin" as const },
                { label: "Season", key: "fd_season" as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{label}</p>
                  <input
                    type="text"
                    value={feedForm[key]}
                    onChange={(e) => setFeedForm((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={`Enter ${label.toLowerCase()}...`}
                    className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                    style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleSaveFeed}
              disabled={!isFeedFormValid || isSavingFeed}
              className="w-full mt-5 py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
              style={{
                backgroundColor: isFeedFormValid && !isSavingFeed ? "#064E3B" : "#D3D3D3",
                color: isFeedFormValid && !isSavingFeed ? "white" : "#999",
                border: "none",
                fontFamily: "Nunito, sans-serif",
                cursor: isFeedFormValid && !isSavingFeed ? "pointer" : "not-allowed",
              }}
            >
              {isSavingFeed ? (
                <><svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" /></svg>Saving...</>
              ) : (editingFeed ? "Update Feed" : "Add Feed")}
            </button>
          </div>
        </div>
      )}

      {/* ══ ADD TYPE MODAL ══ */}
      {showTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <h3 className="text-base font-bold mb-4" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>Add Feed Type</h3>
            <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Type Name *</p>
            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="e.g. Roughage"
              className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark mb-5"
              style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowTypeModal(false)} className="flex-1 py-3 rounded-xl font-bold" style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>Cancel</button>
              <button
                onClick={handleSaveType}
                disabled={!newTypeName.trim() || isSavingType}
                className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: newTypeName.trim() && !isSavingType ? "#064E3B" : "#D3D3D3", color: newTypeName.trim() && !isSavingType ? "white" : "#999", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                {isSavingType ? "Saving..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ADD CATEGORY MODAL ══ */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <h3 className="text-base font-bold mb-4" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>Add Category</h3>
            {/* Android cascade: Feed Type → Category Name */}
            <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Feed Type *</p>
            <div className="relative mb-3">
              <select
                value={newCatTypeId}
                onChange={(e) => { setNewCatTypeId(e.target.value); setNewCatName(""); }}
                className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none appearance-none pr-8"
                style={{ backgroundColor: "#F1F5F9", color: newCatTypeId ? "#231F20" : "#999", fontFamily: "Nunito, sans-serif" }}
              >
                <option value="">Select type...</option>
                {feedTypes.map((ft) => <option key={ft.id} value={ft.id}>{getName(ft)}</option>)}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </div>
            </div>
            <p className="text-xs font-bold uppercase mb-1" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Category Name *</p>
            <input
              type="text"
              value={newCatName}
              disabled={!newCatTypeId}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder={!newCatTypeId ? "Select feed type first" : "e.g. Cereal Grains"}
              className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark mb-5"
              style={{ backgroundColor: newCatTypeId ? "#F1F5F9" : "#E8EDEB", color: "#231F20", fontFamily: "Nunito, sans-serif", opacity: !newCatTypeId ? 0.6 : 1 }}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowCatModal(false)} className="flex-1 py-3 rounded-xl font-bold" style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>Cancel</button>
              <button
                onClick={handleSaveCategory}
                disabled={!newCatName.trim() || !newCatTypeId || isSavingCat}
                className="flex-1 py-3 rounded-xl font-bold"
                style={{ backgroundColor: newCatName.trim() && newCatTypeId && !isSavingCat ? "#064E3B" : "#D3D3D3", color: newCatName.trim() && newCatTypeId && !isSavingCat ? "white" : "#999", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}
              >
                {isSavingCat ? "Saving..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM DELETE FEED ══ */}
      {confirmDeleteFeed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <h3 className="text-base font-bold mb-2" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>Delete Feed?</h3>
            <p className="text-sm mb-5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              &quot;{confirmDeleteFeed.fd_name}&quot; will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteFeed(null)} className="flex-1 py-3 rounded-xl font-bold" style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleDeleteFeed(confirmDeleteFeed)} className="flex-1 py-3 rounded-xl font-bold" style={{ backgroundColor: "#E44A4A", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
                {deletingFeedId === confirmDeleteFeed.feed_id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM DELETE TYPE ══ */}
      {confirmDeleteType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <h3 className="text-base font-bold mb-2" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>Delete Type?</h3>
            <p className="text-sm mb-5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              &quot;{getName(confirmDeleteType)}&quot; will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteType(null)} className="flex-1 py-3 rounded-xl font-bold" style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleDeleteType(confirmDeleteType)} className="flex-1 py-3 rounded-xl font-bold" style={{ backgroundColor: "#E44A4A", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
                {deletingTypeId === confirmDeleteType.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM DELETE CATEGORY ══ */}
      {confirmDeleteCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <h3 className="text-base font-bold mb-2" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>Delete Category?</h3>
            <p className="text-sm mb-5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              &quot;{getCatName(confirmDeleteCat)}&quot; will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteCat(null)} className="flex-1 py-3 rounded-xl font-bold" style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleDeleteCategory(confirmDeleteCat)} className="flex-1 py-3 rounded-xl font-bold" style={{ backgroundColor: "#E44A4A", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
                {deletingCatId === confirmDeleteCat.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

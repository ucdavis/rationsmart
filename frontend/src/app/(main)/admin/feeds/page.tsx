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
  description?: string;
  is_active?: boolean;
  status?: string;
}

interface AdminFeedCategory {
  id: string;
  category_name?: string;
  name?: string;
  feed_type?: { id: string; type_name?: string } | string;
  feed_type_id?: string;
  description?: string;
  is_active?: boolean;
  status?: string;
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
  // Android-style nav: landing view shows 3 cards; sub-views show one section
  const [section, setSection] = useState<"landing" | TabType>("landing");
  const [feedTypes, setFeedTypes] = useState<AdminFeedType[]>([]);
  const [feedCategories, setFeedCategories] = useState<AdminFeedCategory[]>([]);
  const [feeds, setFeeds] = useState<AdminFeed[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Match Android FragmentFeed search: filter by feed name only.
  const filteredFeeds = feeds.filter((f) => {
    if (!searchQuery) return true;
    return f.fd_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false;
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

  const goToSection = (s: TabType) => {
    setTab(s);
    setSection(s);
  };

  const sectionTitle = section === "types" ? "Feed Type" : section === "categories" ? "Feed Category" : section === "feeds" ? "Feed" : "Feed Management";

  // ─── LANDING: 3 nav cards ──────────────────────────────────────────────────
  if (section === "landing") {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)" }}>
        <Toolbar type="back" title="Feed Management" onBack={() => router.back()} />

        <div className="ml-3 mt-5">
          <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>Administration</p>
          <p style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 20, fontWeight: 700 }}>Configure Resources</p>
        </div>

        <div className="px-3 mt-5 space-y-3">
          {([
            { key: "types" as TabType, label: "Feed Type" },
            { key: "categories" as TabType, label: "Feed Category" },
            { key: "feeds" as TabType, label: "Feed" },
          ]).map((c) => (
            <button
              key={c.key}
              onClick={() => goToSection(c.key)}
              className="w-full flex items-center justify-between bg-white"
              style={{
                borderRadius: 16,
                padding: "16px 16px 16px 14px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* left green accent bar */}
              <span
                style={{
                  position: "absolute",
                  left: 0, top: 12, bottom: 12,
                  width: 4,
                  borderRadius: 2,
                  backgroundColor: "#064E3B",
                }}
              />
              <span
                className="font-bold"
                style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 16, paddingLeft: 8 }}
              >
                {c.label}
              </span>
              <span
                className="flex items-center justify-center"
                style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "#E4F7EF" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 3l4 4-4 4" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)" }}>
      <Toolbar type="back" title={sectionTitle} onBack={() => setSection("landing")} />

      {/* MANAGEMENT subheader (matches Android list screens) */}
      <p
        className="font-bold uppercase tracking-wide mt-5 ml-3 mb-2"
        style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 14 }}
      >
        Management
      </p>

      {/* ── FEEDS TAB ── (matches Android fragment_feed.xml: search-by-name only,
          no filter dropdowns; FAB for add) */}
      {tab === "feeds" && (
        <>
          {/* Search by feed name — matches Android til_search_feed */}
          <div className="px-3 pt-3">
            <div
              className="flex items-center"
              style={{
                backgroundColor: "#F1F5F9",
                borderRadius: 16,
                padding: "10px 14px",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" stroke="#6D6D6D" strokeWidth="2" />
                <path d="M21 21l-4.35-4.35" stroke="#6D6D6D" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by feed name"
                className="flex-1 bg-transparent border-none focus:outline-none ml-2"
                style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pt-2" style={{ paddingBottom: 100 }}>
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
                  className="mx-3 my-2 bg-white"
                  style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", padding: 16 }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0" style={{ marginRight: 10 }}>
                      <p className="font-bold truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 20 }}>
                        {f.fd_name || "N/A"}
                      </p>
                      <p className="uppercase" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 14, marginTop: 10 }}>
                        {f.fd_category || "N/A"}
                      </p>
                      <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14, marginTop: 10 }}>
                        {f.fd_type || "N/A"}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {/* Edit: go_green_15 bg + dark_aquamarine_green tint,
                          icon = ic_edit_nutrient_info */}
                      <button
                        onClick={() => openEditFeed(f)}
                        className="flex items-center justify-center"
                        style={{ borderRadius: 60, backgroundColor: "rgba(5,188,109,0.15)", padding: 10, border: "none", cursor: "pointer" }}
                        aria-label="Edit feed"
                      >
                        <svg width="20" height="20" viewBox="0 0 960 960" fill="#064E3B">
                          <path d="M216,744h51l375,-375 -51,-51 -375,375v51ZM180.18,816q-15.18,0 -25.68,-10.3 -10.5,-10.29 -10.5,-25.52v-86.85q0,-14.33 5,-27.33 5,-13 16,-24l477,-477q11,-11 23.84,-16 12.83,-5 27,-5 14.16,0 27.16,5t24,16l51,51q11,11 16,24t5,26.54q0,14.45 -5.02,27.54T795,318L318,795q-11,11 -23.95,16t-27.24,5h-86.63ZM744,267l-51,-51 51,51ZM616.05,343.95L591,318l51,51 -25.95,-25.05Z" />
                        </svg>
                      </button>
                      {/* Delete: carmine_pink_20 bg + red_ryb tint,
                          icon = ic_delete */}
                      <button
                        onClick={() => setConfirmDeleteFeed(f)}
                        disabled={deletingFeedId === f.feed_id}
                        className="flex items-center justify-center"
                        style={{ borderRadius: 60, backgroundColor: "rgba(228,74,74,0.2)", padding: 10, border: "none", cursor: "pointer" }}
                        aria-label="Delete feed"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#FC2E20">
                          <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2L18,9c0,-1.1 -0.9,-2 -2,-2L8,7c-1.1,0 -2,0.9 -2,2v10zM9,9h6c0.55,0 1,0.45 1,1v8c0,0.55 -0.45,1 -1,1L9,19c-0.55,0 -1,-0.45 -1,-1v-8c0,-0.55 0.45,-1 1,-1zM15.5,4l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29L9.91,3c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4L6,4c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1h-2.5z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Floating Action Button — Android btn_add_feed (dark_aquamarine_green
              bg, white +, 56dp, bottom-right inside the centered column). */}
          <button
            onClick={openAddFeed}
            aria-label="Add feed"
            style={{
              position: "fixed",
              bottom: 20,
              right: "max(12px, calc((100vw - 480px) / 2 + 12px))",
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#064E3B",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 960 960" fill="#FFFFFF">
              <path d="M440,520L240,520q-17,0 -28.5,-11.5T200,480q0,-17 11.5,-28.5T240,440h200v-200q0,-17 11.5,-28.5T480,200q17,0 28.5,11.5T520,240v200h200q17,0 28.5,11.5T760,480q0,17 -11.5,28.5T720,520L520,520v200q0,17 -11.5,28.5T480,760q-17,0 -28.5,-11.5T440,720v-200Z" />
            </svg>
          </button>
        </>
      )}

      {/* ── TYPES TAB ── (matches Android fragment_feed_type.xml +
          layout_item_feed_type.xml: card with name + status badge, description,
          delete (top-right). No search/filters; FAB for add.) */}
      {tab === "types" && (
        <>
          <div className="flex-1 overflow-y-auto pt-2" style={{ paddingBottom: 100 }}>
            {isLoading ? [0,1,2].map((i) => <SkeletonCard key={i} />) : (
              feedTypes.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <p style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}>No feed types found</p>
                </div>
              ) : feedTypes.map((ft) => {
                // Active by default — Android adapter shows ACTIVE badge unless
                // is_active is explicitly false.
                const isActive = ft.is_active !== false;
                return (
                  <div key={ft.id} className="mx-3 my-2 rounded-2xl bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <p className="font-bold truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 20 }}>{getName(ft) || "N/A"}</p>
                        <span
                          className="font-bold uppercase flex-shrink-0"
                          style={{
                            backgroundColor: isActive ? "#F0FDF4" : "#FEC5BB",
                            color: isActive ? "#064E3B" : "#E44A4A",
                            border: `1px solid ${isActive ? "rgba(5,188,109,0.15)" : "rgba(228,74,74,0.20)"}`,
                            fontFamily: "Nunito, sans-serif",
                            fontSize: 10,
                            padding: "2px 10px",
                            borderRadius: 10,
                          }}
                        >
                          {isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>
                      {/* Delete — Android ic_delete inside circular pill
                          (carmine_pink_20 bg, red_ryb tint) */}
                      <button
                        onClick={() => setConfirmDeleteType(ft)}
                        disabled={deletingTypeId === ft.id}
                        className="flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "rgba(228,74,74,0.2)", border: "none", borderRadius: 60, padding: 10, cursor: "pointer" }}
                        aria-label="Delete type"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#FC2E20">
                          <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2L18,9c0,-1.1 -0.9,-2 -2,-2L8,7c-1.1,0 -2,0.9 -2,2v10zM9,9h6c0.55,0 1,0.45 1,1v8c0,0.55 -0.45,1 -1,1L9,19c-0.55,0 -1,-0.45 -1,-1v-8c0,-0.55 0.45,-1 1,-1zM15.5,4l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29L9.91,3c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4L6,4c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1h-2.5z" />
                        </svg>
                      </button>
                    </div>
                    <p className="mt-2" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>
                      {ft.description || "N/A"}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* FAB — btn_add_feed_type */}
          <button
            onClick={() => setShowTypeModal(true)}
            aria-label="Add feed type"
            style={{
              position: "fixed",
              bottom: 20,
              right: "max(12px, calc((100vw - 480px) / 2 + 12px))",
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#064E3B",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 960 960" fill="#FFFFFF">
              <path d="M440,520L240,520q-17,0 -28.5,-11.5T200,480q0,-17 11.5,-28.5T240,440h200v-200q0,-17 11.5,-28.5T480,200q17,0 28.5,11.5T520,240v200h200q17,0 28.5,11.5T760,480q0,17 -11.5,28.5T720,520L520,520v200q0,17 -11.5,28.5T480,760q-17,0 -28.5,-11.5T440,720v-200Z" />
            </svg>
          </button>
        </>
      )}

      {/* ── CATEGORIES TAB ── (matches Android fragment_feed_category.xml +
          layout_item_feed_category.xml: name + status badge | TYPE | description
          + delete at bottom-right. No search/filters; FAB for add.) */}
      {tab === "categories" && (
        <>
          <div className="flex-1 overflow-y-auto pt-2" style={{ paddingBottom: 100 }}>
            {isLoading ? [0,1,2].map((i) => <SkeletonCard key={i} />) : (
              feedCategories.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <p style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}>No categories found</p>
                </div>
              ) : feedCategories.map((fc) => {
                const isActive = fc.is_active !== false;
                return (
                  <div key={fc.id} className="mx-3 my-2 rounded-2xl bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold flex-1 min-w-0" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 20 }}>{getCatName(fc) || "N/A"}</p>
                      <span
                        className="font-bold uppercase flex-shrink-0"
                        style={{
                          backgroundColor: isActive ? "#F0FDF4" : "#FEC5BB",
                          color: isActive ? "#064E3B" : "#E44A4A",
                          border: `1px solid ${isActive ? "rgba(5,188,109,0.15)" : "rgba(228,74,74,0.20)"}`,
                          fontFamily: "Nunito, sans-serif",
                          fontSize: 10,
                          padding: "2px 10px",
                          borderRadius: 10,
                          marginTop: 4,
                        }}
                      >
                        {isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                    <p
                      className="uppercase mt-2"
                      style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 14 }}
                    >
                      {getFeedTypeName(fc) || "N/A"}
                    </p>
                    <div className="flex items-end justify-between gap-3 mt-2">
                      <p className="flex-1 min-w-0" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>
                        {fc.description || "N/A"}
                      </p>
                      {/* Delete — Android ic_delete inside circular pill */}
                      <button
                        onClick={() => setConfirmDeleteCat(fc)}
                        disabled={deletingCatId === fc.id}
                        className="flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "rgba(228,74,74,0.2)", border: "none", borderRadius: 60, padding: 10, cursor: "pointer" }}
                        aria-label="Delete category"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#FC2E20">
                          <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2L18,9c0,-1.1 -0.9,-2 -2,-2L8,7c-1.1,0 -2,0.9 -2,2v10zM9,9h6c0.55,0 1,0.45 1,1v8c0,0.55 -0.45,1 -1,1L9,19c-0.55,0 -1,-0.45 -1,-1v-8c0,-0.55 0.45,-1 1,-1zM15.5,4l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29L9.91,3c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4L6,4c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1h-2.5z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* FAB — btn_add_feed_category */}
          <button
            onClick={() => setShowCatModal(true)}
            aria-label="Add feed category"
            style={{
              position: "fixed",
              bottom: 20,
              right: "max(12px, calc((100vw - 480px) / 2 + 12px))",
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#064E3B",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 960 960" fill="#FFFFFF">
              <path d="M440,520L240,520q-17,0 -28.5,-11.5T200,480q0,-17 11.5,-28.5T240,440h200v-200q0,-17 11.5,-28.5T480,200q17,0 28.5,11.5T520,240v200h200q17,0 28.5,11.5T760,480q0,17 -11.5,28.5T720,520L520,520v200q0,17 -11.5,28.5T480,760q-17,0 -28.5,-11.5T440,720v-200Z" />
            </svg>
          </button>
        </>
      )}

      {/* ══ ADD/EDIT FEED MODAL ══ — confined to centered column */}
      {showFeedModal && (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
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
        <div className="fixed top-0 h-full z-50 flex items-center justify-center px-6" style={{ left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.5)" }}>
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
        <div className="fixed top-0 h-full z-50 flex items-center justify-center px-6" style={{ left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.5)" }}>
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
        <div className="fixed top-0 h-full z-50 flex items-center justify-center px-6" style={{ left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl w-full max-w-xs pb-5" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div className="flex justify-center mt-7 mb-4">
              <div className="flex items-center justify-center" style={{ backgroundColor: "rgba(228,74,74,0.2)", borderRadius: 60, padding: 14 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#FC2E20" strokeWidth="2"/>
                  <path d="M12 7v5M12 16v1" stroke="#FC2E20" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            <h3 className="text-center font-bold mb-4 px-3" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}>Are you sure you want to delete feed?</h3>
            <p className="text-center text-sm mb-5 px-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              &quot;{confirmDeleteFeed.fd_name}&quot; will be permanently deleted. This action cannot be undone.
            </p>
            <div className="flex gap-2 px-3">
              <button onClick={() => setConfirmDeleteFeed(null)} className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5" style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="#064E3B" strokeWidth="2" strokeLinecap="round"/></svg>
                No
              </button>
              <button onClick={() => handleDeleteFeed(confirmDeleteFeed)} className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5" style={{ backgroundColor: "#E44A4A", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V3h4v1M4 4v8h6V4H4Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {deletingFeedId === confirmDeleteFeed.feed_id ? "Deleting..." : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM DELETE TYPE ══ */}
      {confirmDeleteType && (
        <div className="fixed top-0 h-full z-50 flex items-center justify-center px-6" style={{ left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl w-full max-w-xs pb-5" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div className="flex justify-center mt-7 mb-4">
              <div className="flex items-center justify-center" style={{ backgroundColor: "rgba(228,74,74,0.2)", borderRadius: 60, padding: 14 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#FC2E20" strokeWidth="2"/>
                  <path d="M12 7v5M12 16v1" stroke="#FC2E20" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            <h3 className="text-center font-bold mb-4" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}>Are you sure you want to delete type?</h3>
            <p className="text-center text-sm mb-5 px-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              &quot;{getName(confirmDeleteType)}&quot; will be permanently deleted. This action cannot be undone.
            </p>
            <div className="flex gap-2 px-3">
              <button onClick={() => setConfirmDeleteType(null)} className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5" style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="#064E3B" strokeWidth="2" strokeLinecap="round"/></svg>
                No
              </button>
              <button onClick={() => handleDeleteType(confirmDeleteType)} className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5" style={{ backgroundColor: "#E44A4A", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V3h4v1M4 4v8h6V4H4Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {deletingTypeId === confirmDeleteType.id ? "Deleting..." : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM DELETE CATEGORY ══ */}
      {confirmDeleteCat && (
        <div className="fixed top-0 h-full z-50 flex items-center justify-center px-6" style={{ left: "max(0px, calc((100vw - 480px) / 2))", width: "min(100vw, 480px)", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl w-full max-w-xs pb-5" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div className="flex justify-center mt-7 mb-4">
              <div className="flex items-center justify-center" style={{ backgroundColor: "rgba(228,74,74,0.2)", borderRadius: 60, padding: 14 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#FC2E20" strokeWidth="2"/>
                  <path d="M12 7v5M12 16v1" stroke="#FC2E20" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            <h3 className="text-center font-bold mb-4" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}>Are you sure you want to delete category?</h3>
            <p className="text-center text-sm mb-5 px-3" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              &quot;{getCatName(confirmDeleteCat)}&quot; will be permanently deleted. This action cannot be undone.
            </p>
            <div className="flex gap-2 px-3">
              <button onClick={() => setConfirmDeleteCat(null)} className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5" style={{ border: "2px solid #064E3B", color: "#064E3B", background: "white", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="#064E3B" strokeWidth="2" strokeLinecap="round"/></svg>
                No
              </button>
              <button onClick={() => handleDeleteCategory(confirmDeleteCat)} className="flex-1 py-3 font-bold flex items-center justify-center gap-1.5" style={{ backgroundColor: "#E44A4A", color: "white", border: "none", fontFamily: "Nunito, sans-serif", cursor: "pointer", borderRadius: 16 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V3h4v1M4 4v8h6V4H4Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {deletingCatId === confirmDeleteCat.id ? "Deleting..." : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

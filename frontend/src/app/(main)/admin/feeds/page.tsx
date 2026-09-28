"use client";

// ─── Types ────────────────────────────────────────────────────────────────────

import FeedTypeSheet from "@/components/admin/feeds/FeedTypeSheet";
import FeedCategorySheet from "@/components/admin/feeds/FeedCategorySheet";
import DeleteFeedDialog from "@/components/admin/feeds/DeleteFeedDialog";
import DeleteFeedTypeDialog from "@/components/admin/feeds/DeleteFeedTypeDialog";
import DeleteFeedCategoryDialog from "@/components/admin/feeds/DeleteFeedCategoryDialog";
import FeedFormSheet from "@/components/admin/feeds/FeedFormSheet";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n-ui";
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
import { useEscapeKey } from "@/lib/use-escape";
import { ADMIN_PAGE_SIZE, collectPages } from "@/lib/pagination";
import { COLORS, ADMIN_BACKGROUND } from "@/lib/colors";
import { anyNutrientInvalid, NUTRIENT_RANGE_MESSAGE } from "@/lib/validators";
import { useLatestRef } from "@/lib/use-latest";
import {
  AdminFeed,
  AdminFeedCategory,
  AdminFeedType,
  Country,
  NUMERIC_FEED_FIELDS,
  SkeletonCard,
  TabType,
  emptyFeedForm,
} from "@/components/admin/feeds/shared";

export default function AdminFeedsPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));
  const t = useT();
  const tRef = useLatestRef(t);

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
  useEscapeKey(!!showFeedModal, () => setShowFeedModal(false));
  const [editingFeed, setEditingFeed] = useState<AdminFeed | null>(null);
  const [feedForm, setFeedForm] = useState(emptyFeedForm);
  const [isSavingFeed, setIsSavingFeed] = useState(false);
  const [deletingFeedId, setDeletingFeedId] = useState<string | null>(null);
  const [confirmDeleteFeed, setConfirmDeleteFeed] = useState<AdminFeed | null>(null);
  useEscapeKey(!!confirmDeleteFeed, () => setConfirmDeleteFeed(null));

  // Category modal state (Android dialog_feed_category.xml fields)
  const [showCatModal, setShowCatModal] = useState(false);
  useEscapeKey(!!showCatModal, () => setShowCatModal(false));
  const [newCatName, setNewCatName] = useState("");
  const [newCatTypeId, setNewCatTypeId] = useState("");
  const [newCatDescription, setNewCatDescription] = useState("");
  const [isSavingCat, setIsSavingCat] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<AdminFeedCategory | null>(null);
  useEscapeKey(!!confirmDeleteCat, () => setConfirmDeleteCat(null));

  // Type modal state (Android dialog_feed_type.xml fields)
  const [showTypeModal, setShowTypeModal] = useState(false);
  useEscapeKey(!!showTypeModal, () => setShowTypeModal(false));
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDescription, setNewTypeDescription] = useState("");
  const [isSavingType, setIsSavingType] = useState(false);
  const [deletingTypeId, setDeletingTypeId] = useState<string | null>(null);
  const [confirmDeleteType, setConfirmDeleteType] = useState<AdminFeedType | null>(null);
  useEscapeKey(!!confirmDeleteType, () => setConfirmDeleteType(null));

  const getName = (t: AdminFeedType) => t.type_name ?? t.name ?? "";
  const getCatName = (c: AdminFeedCategory) => c.category_name ?? c.name ?? "";
  const getFeedTypeName = (c: AdminFeedCategory) => {
    // First try the embedded feed_type object on the category (older
    // backend shape). Then fall back to resolving via feed_type_id
    // against the separately-loaded feedTypes list — the v1 backend
    // now omits the nested object on list-feed-categories, returning
    // only feed_type_id, so without the fallback the Add-Feed
    // category dropdown's filter would silently match nothing.
    if (typeof c.feed_type === "string") return c.feed_type;
    if (c.feed_type && c.feed_type.type_name) return c.feed_type.type_name;
    if (c.feed_type_id) {
      const t = feedTypes.find((ft) => ft.id === c.feed_type_id);
      if (t) return t.type_name ?? t.name ?? "";
    }
    return "";
  };

  const loadAll = useCallback(() => {
    if (!user?.id) return;
    setIsLoading(true);
    Promise.all([
      getAdminFeedTypes(user.id),
      getAdminFeedCategories(user.id),
      collectPages(
        (page) => getAdminFeeds(user.id, page, ADMIN_PAGE_SIZE),
        (fd) => {
          const d = fd as { feeds?: AdminFeed[]; items?: AdminFeed[] } | AdminFeed[];
          return Array.isArray(d) ? d : (d?.feeds ?? d?.items ?? []);
        }
      ),
      getCountries(),
    ])
      .then(([typesRes, catsRes, allFeeds, countriesRes]) => {
        setFeedTypes(
          Array.isArray(typesRes.data) ? typesRes.data : (typesRes.data?.feed_types ?? [])
        );
        setFeedCategories(
          Array.isArray(catsRes.data) ? catsRes.data : (catsRes.data?.categories ?? [])
        );
        setFeeds(allFeeds);
        setCountries(Array.isArray(countriesRes.data) ? countriesRes.data : []);
      })
      .catch(() => showSnackbar(tRef.current("Could not load feed data"), "error"))
      .finally(() => setIsLoading(false));
  }, [user?.id, showSnackbar, tRef]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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
      showSnackbar(t("Name, Type and Country are required"), "error");
      return;
    }
    // Match Android FeedRequest: every nutrient is a non-null Double (default 0.0),
    // every string field is non-null (default ""). A non-numeric entry would
    // serialise as null (NaN), so reject it instead of sending it.
    const num = (v: string) => (v ? Number(v) : 0);
    if (anyNutrientInvalid(NUMERIC_FEED_FIELDS.map((k) => feedForm[k]))) {
      showSnackbar(t(NUTRIENT_RANGE_MESSAGE), "error");
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
      // fd_code and the three metadata fields aren't editable in the dialog
      // (Android parity) but the backend requires them. Echo back what was
      // loaded — "" only for a new feed — so an edit never wipes them.
      // fd_code is the key the CLIMDES sync matches on.
      fd_code: feedForm.fd_code,
      fd_dm: num(feedForm.fd_dm),
      fd_ash: num(feedForm.fd_ash),
      fd_cellulose: num(feedForm.fd_cellulose),
      fd_cf: num(feedForm.fd_cf),
      fd_cp: num(feedForm.fd_cp),
      fd_ee: num(feedForm.fd_ee),
      fd_hemicellulose: num(feedForm.fd_hemicellulose),
      fd_st: num(feedForm.fd_st),
      fd_ndf: num(feedForm.fd_ndf),
      fd_adf: num(feedForm.fd_adf),
      fd_lg: num(feedForm.fd_lg),
      fd_ndin: num(feedForm.fd_ndin),
      fd_nfe: num(feedForm.fd_nfe),
      fd_npn_cp: num(feedForm.fd_npn_cp),
      fd_adin: num(feedForm.fd_adin),
      fd_ca: num(feedForm.fd_ca),
      fd_p: num(feedForm.fd_p),
      fd_ipb_local_lab: feedForm.fd_ipb_local_lab,
      fd_orginin: feedForm.fd_orginin,
      fd_season: feedForm.fd_season,
    };
    try {
      if (editingFeed?.feed_id) {
        await updateAdminFeed(editingFeed.feed_id, user.id, body);
        showSnackbar(t("Feed updated successfully"), "success");
      } else {
        await addAdminFeed(user.id, body);
        showSnackbar(t("Feed added successfully"), "success");
      }
      setShowFeedModal(false);
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : t("Save failed"), "error");
    } finally {
      setIsSavingFeed(false);
    }
  };

  const handleDeleteFeed = async (feed: AdminFeed) => {
    if (!user?.id || !feed.feed_id) return;
    setDeletingFeedId(feed.feed_id);
    try {
      await deleteAdminFeed(feed.feed_id, user.id);
      showSnackbar(t("Feed deleted"), "success");
      setConfirmDeleteFeed(null);
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : t("Delete failed"), "error");
    } finally {
      setDeletingFeedId(null);
    }
  };

  // ── Category CRUD ──────────────────────────────────────────────────────────

  const handleSaveCategory = async () => {
    if (!user?.id || !newCatName.trim() || !newCatTypeId) {
      showSnackbar(t("Category name and type are required"), "error");
      return;
    }
    setIsSavingCat(true);
    try {
      await addAdminFeedCategory(user.id, {
        category_name: newCatName.trim(),
        description: newCatDescription.trim(),
        feed_type_id: newCatTypeId,
        sort_order: feedCategories.length + 1,
      });
      showSnackbar(t("Category added successfully"), "success");
      setShowCatModal(false);
      setNewCatName("");
      setNewCatTypeId("");
      setNewCatDescription("");
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : t("Save failed"), "error");
    } finally {
      setIsSavingCat(false);
    }
  };

  const handleDeleteCategory = async (cat: AdminFeedCategory) => {
    if (!user?.id || !cat.id) return;
    setDeletingCatId(cat.id);
    try {
      await deleteAdminFeedCategory(cat.id, user.id);
      showSnackbar(t("Category deleted"), "success");
      setConfirmDeleteCat(null);
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : t("Delete failed"), "error");
    } finally {
      setDeletingCatId(null);
    }
  };

  // ── Type CRUD ──────────────────────────────────────────────────────────────

  const handleSaveType = async () => {
    if (!user?.id || !newTypeName.trim()) {
      showSnackbar(t("Type name is required"), "error");
      return;
    }
    setIsSavingType(true);
    try {
      await addAdminFeedType(user.id, {
        type_name: newTypeName.trim(),
        description: newTypeDescription.trim(),
        sort_order: feedTypes.length + 1,
      });
      showSnackbar(t("Feed type added successfully"), "success");
      setShowTypeModal(false);
      setNewTypeName("");
      setNewTypeDescription("");
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : t("Save failed"), "error");
    } finally {
      setIsSavingType(false);
    }
  };

  const handleDeleteType = async (type: AdminFeedType) => {
    if (!user?.id || !type.id) return;
    setDeletingTypeId(type.id);
    try {
      await deleteAdminFeedType(type.id, user.id);
      showSnackbar(t("Feed type deleted"), "success");
      setConfirmDeleteType(null);
      loadAll();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : t("Delete failed"), "error");
    } finally {
      setDeletingTypeId(null);
    }
  };

  const isFeedFormValid =
    feedForm.fd_name.trim() !== "" && feedForm.fd_type !== "" && feedForm.fd_country_name !== "";

  const goToSection = (s: TabType) => {
    setTab(s);
    setSection(s);
  };

  const sectionTitle =
    section === "types"
      ? t("Feed Type")
      : section === "categories"
        ? t("Feed Category")
        : section === "feeds"
          ? t("Feed")
          : t("Feed Management");

  // ─── LANDING: 3 nav cards ──────────────────────────────────────────────────
  if (section === "landing") {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: ADMIN_BACKGROUND }}>
        <Toolbar type="back" title={t("Feed Management")} onBack={() => router.back()} />

        <div className="ml-3 mt-5">
          <p style={{ color: COLORS.darkSilver, fontSize: 14 }}>{t("Administration")}</p>
          <p
            style={{
              color: COLORS.raisinBlack,
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {t("Configure Resources")}
          </p>
        </div>

        <div className="px-3 mt-5 space-y-3">
          {[
            { key: "types" as TabType, label: "Feed Type" },
            { key: "categories" as TabType, label: "Feed Category" },
            { key: "feeds" as TabType, label: "Feed" },
          ].map((c) => (
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
                  left: 0,
                  top: 12,
                  bottom: 12,
                  width: 4,
                  borderRadius: 2,
                  backgroundColor: COLORS.darkAquamarineGreen,
                }}
              />
              <span
                className="font-bold"
                style={{
                  color: COLORS.darkAquamarineGreen,
                  fontSize: 16,
                  paddingLeft: 8,
                }}
              >
                {t(c.label)}
              </span>
              <span
                className="flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: COLORS.brightGrayNew,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M5 3l4 4-4 4"
                    stroke={COLORS.darkAquamarineGreen}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: ADMIN_BACKGROUND }}>
      <Toolbar type="back" title={sectionTitle} onBack={() => setSection("landing")} />

      {/* MANAGEMENT subheader (matches Android list screens) */}
      <p
        className="font-bold uppercase tracking-wide mt-5 ml-3 mb-2"
        style={{ color: COLORS.darkAquamarineGreen, fontSize: 14 }}
      >
        {t("Management")}
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
                backgroundColor: COLORS.americanDiamond,
                borderRadius: 16,
                padding: "10px 14px",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" stroke={COLORS.darkSilver} strokeWidth="2" />
                <path
                  d="M21 21l-4.35-4.35"
                  stroke={COLORS.darkSilver}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                aria-label={t("Search by feed name")}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Search by feed name")}
                className="flex-1 bg-transparent border-none focus:outline-none ml-2"
                style={{ color: COLORS.raisinBlack, fontSize: 14 }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pt-2" style={{ paddingBottom: 100 }}>
            {isLoading ? (
              [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
            ) : filteredFeeds.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-base" style={{ color: COLORS.spanishGray }}>
                  {searchQuery ? t("No feeds match your search") : t("No feeds found")}
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
                      <p
                        className="font-bold truncate"
                        style={{ color: COLORS.raisinBlack, fontSize: 20 }}
                      >
                        {f.fd_name || t("N/A")}
                      </p>
                      <p
                        className="uppercase"
                        style={{
                          color: COLORS.darkAquamarineGreen,
                          fontSize: 14,
                          marginTop: 10,
                        }}
                      >
                        {f.fd_category || t("N/A")}
                      </p>
                      <p
                        style={{
                          color: COLORS.darkSilver,
                          fontSize: 14,
                          marginTop: 10,
                        }}
                      >
                        {f.fd_type || t("N/A")}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {/* Edit: go_green_15 bg + dark_aquamarine_green tint,
                          icon = ic_edit_nutrient_info */}
                      <button
                        onClick={() => openEditFeed(f)}
                        className="flex items-center justify-center"
                        style={{
                          borderRadius: 60,
                          backgroundColor: "rgba(5,188,109,0.15)",
                          padding: 10,
                          border: "none",
                          cursor: "pointer",
                        }}
                        aria-label={t("Edit feed")}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 960 960"
                          fill={COLORS.darkAquamarineGreen}
                        >
                          <path d="M216,744h51l375,-375 -51,-51 -375,375v51ZM180.18,816q-15.18,0 -25.68,-10.3 -10.5,-10.29 -10.5,-25.52v-86.85q0,-14.33 5,-27.33 5,-13 16,-24l477,-477q11,-11 23.84,-16 12.83,-5 27,-5 14.16,0 27.16,5t24,16l51,51q11,11 16,24t5,26.54q0,14.45 -5.02,27.54T795,318L318,795q-11,11 -23.95,16t-27.24,5h-86.63ZM744,267l-51,-51 51,51ZM616.05,343.95L591,318l51,51 -25.95,-25.05Z" />
                        </svg>
                      </button>
                      {/* Delete: carmine_pink_20 bg + red_ryb tint,
                          icon = ic_delete */}
                      <button
                        onClick={() => setConfirmDeleteFeed(f)}
                        disabled={deletingFeedId === f.feed_id}
                        className="flex items-center justify-center"
                        style={{
                          borderRadius: 60,
                          backgroundColor: "rgba(228,74,74,0.2)",
                          padding: 10,
                          border: "none",
                          cursor: "pointer",
                        }}
                        aria-label={t("Delete feed")}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={COLORS.redRyb}>
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
            aria-label={t("Add feed")}
            style={{
              position: "fixed",
              bottom: 20,
              right: "max(12px, calc((100vw - 480px) / 2 + 12px))",
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: COLORS.darkAquamarineGreen,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 960 960" fill={COLORS.white}>
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
            {isLoading ? (
              [0, 1, 2].map((i) => <SkeletonCard key={i} />)
            ) : feedTypes.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <p style={{ color: COLORS.spanishGray }}>{t("No feed types found")}</p>
              </div>
            ) : (
              feedTypes.map((ft) => {
                // Active by default — Android adapter shows ACTIVE badge unless
                // is_active is explicitly false.
                const isActive = ft.is_active !== false;
                return (
                  <div
                    key={ft.id}
                    className="mx-3 my-2 rounded-2xl bg-white p-4"
                    style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <p
                          className="font-bold truncate"
                          style={{
                            color: COLORS.raisinBlack,
                            fontSize: 20,
                          }}
                        >
                          {getName(ft) || t("N/A")}
                        </p>
                        <span
                          className="font-bold uppercase flex-shrink-0"
                          style={{
                            backgroundColor: isActive ? COLORS.honeydew : COLORS.peachyPink,
                            color: isActive ? COLORS.darkAquamarineGreen : COLORS.carminePink,
                            border: `1px solid ${isActive ? "rgba(5,188,109,0.15)" : "rgba(228,74,74,0.20)"}`,
                            fontSize: 10,
                            padding: "2px 10px",
                            borderRadius: 10,
                          }}
                        >
                          {isActive ? t("ACTIVE") : t("INACTIVE")}
                        </span>
                      </div>
                      {/* Delete — Android ic_delete inside circular pill
                          (carmine_pink_20 bg, red_ryb tint) */}
                      <button
                        onClick={() => setConfirmDeleteType(ft)}
                        disabled={deletingTypeId === ft.id}
                        className="flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: "rgba(228,74,74,0.2)",
                          border: "none",
                          borderRadius: 60,
                          padding: 10,
                          cursor: "pointer",
                        }}
                        aria-label={t("Delete type")}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={COLORS.redRyb}>
                          <path d="M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2L18,9c0,-1.1 -0.9,-2 -2,-2L8,7c-1.1,0 -2,0.9 -2,2v10zM9,9h6c0.55,0 1,0.45 1,1v8c0,0.55 -0.45,1 -1,1L9,19c-0.55,0 -1,-0.45 -1,-1v-8c0,-0.55 0.45,-1 1,-1zM15.5,4l-0.71,-0.71c-0.18,-0.18 -0.44,-0.29 -0.7,-0.29L9.91,3c-0.26,0 -0.52,0.11 -0.7,0.29L8.5,4L6,4c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h12c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1h-2.5z" />
                        </svg>
                      </button>
                    </div>
                    <p className="mt-2" style={{ color: COLORS.darkSilver, fontSize: 14 }}>
                      {ft.description || t("N/A")}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* FAB — btn_add_feed_type */}
          <button
            onClick={() => setShowTypeModal(true)}
            aria-label={t("Add feed type")}
            style={{
              position: "fixed",
              bottom: 20,
              right: "max(12px, calc((100vw - 480px) / 2 + 12px))",
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: COLORS.darkAquamarineGreen,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 960 960" fill={COLORS.white}>
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
            {isLoading ? (
              [0, 1, 2].map((i) => <SkeletonCard key={i} />)
            ) : feedCategories.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <p style={{ color: COLORS.spanishGray }}>{t("No categories found")}</p>
              </div>
            ) : (
              feedCategories.map((fc) => {
                const isActive = fc.is_active !== false;
                return (
                  <div
                    key={fc.id}
                    className="mx-3 my-2 rounded-2xl bg-white p-4"
                    style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className="font-bold flex-1 min-w-0"
                        style={{ color: COLORS.raisinBlack, fontSize: 20 }}
                      >
                        {getCatName(fc) || t("N/A")}
                      </p>
                      <span
                        className="font-bold uppercase flex-shrink-0"
                        style={{
                          backgroundColor: isActive ? COLORS.honeydew : COLORS.peachyPink,
                          color: isActive ? COLORS.darkAquamarineGreen : COLORS.carminePink,
                          border: `1px solid ${isActive ? "rgba(5,188,109,0.15)" : "rgba(228,74,74,0.20)"}`,
                          fontSize: 10,
                          padding: "2px 10px",
                          borderRadius: 10,
                          marginTop: 4,
                        }}
                      >
                        {isActive ? t("ACTIVE") : t("INACTIVE")}
                      </span>
                    </div>
                    <p
                      className="uppercase mt-2"
                      style={{ color: COLORS.darkAquamarineGreen, fontSize: 14 }}
                    >
                      {getFeedTypeName(fc) || t("N/A")}
                    </p>
                    <div className="flex items-end justify-between gap-3 mt-2">
                      <p
                        className="flex-1 min-w-0"
                        style={{ color: COLORS.raisinBlack, fontSize: 14 }}
                      >
                        {fc.description || t("N/A")}
                      </p>
                      {/* Delete — Android ic_delete inside circular pill */}
                      <button
                        onClick={() => setConfirmDeleteCat(fc)}
                        disabled={deletingCatId === fc.id}
                        className="flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: "rgba(228,74,74,0.2)",
                          border: "none",
                          borderRadius: 60,
                          padding: 10,
                          cursor: "pointer",
                        }}
                        aria-label={t("Delete category")}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={COLORS.redRyb}>
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
            aria-label={t("Add feed category")}
            style={{
              position: "fixed",
              bottom: 20,
              right: "max(12px, calc((100vw - 480px) / 2 + 12px))",
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: COLORS.darkAquamarineGreen,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 960 960" fill={COLORS.white}>
              <path d="M440,520L240,520q-17,0 -28.5,-11.5T200,480q0,-17 11.5,-28.5T240,440h200v-200q0,-17 11.5,-28.5T480,200q17,0 28.5,11.5T520,240v200h200q17,0 28.5,11.5T760,480q0,17 -11.5,28.5T720,520L520,520v200q0,17 -11.5,28.5T480,760q-17,0 -28.5,-11.5T440,720v-200Z" />
            </svg>
          </button>
        </>
      )}

      {/* ══ ADD/EDIT FEED MODAL ══ — confined to centered column */}
      {showFeedModal && (
        <FeedFormSheet
          countries={countries}
          editingFeed={editingFeed}
          feedCategories={feedCategories}
          feedForm={feedForm}
          feedTypes={feedTypes}
          getCatName={getCatName}
          getFeedTypeName={getFeedTypeName}
          getName={getName}
          handleSaveFeed={handleSaveFeed}
          isFeedFormValid={isFeedFormValid}
          isSavingFeed={isSavingFeed}
          setFeedForm={setFeedForm}
          setShowFeedModal={setShowFeedModal}
          t={t}
        />
      )}

      {/* ══ ADD TYPE MODAL ══ — matches Android dialog_feed_type.xml */}
      {showTypeModal && (
        <FeedTypeSheet
          handleSaveType={handleSaveType}
          isSavingType={isSavingType}
          newTypeDescription={newTypeDescription}
          newTypeName={newTypeName}
          setNewTypeDescription={setNewTypeDescription}
          setNewTypeName={setNewTypeName}
          setShowTypeModal={setShowTypeModal}
          t={t}
        />
      )}

      {/* ══ ADD CATEGORY MODAL ══ — matches Android dialog_feed_category.xml */}
      {showCatModal && (
        <FeedCategorySheet
          feedTypes={feedTypes}
          getName={getName}
          handleSaveCategory={handleSaveCategory}
          isSavingCat={isSavingCat}
          newCatDescription={newCatDescription}
          newCatName={newCatName}
          newCatTypeId={newCatTypeId}
          setNewCatDescription={setNewCatDescription}
          setNewCatName={setNewCatName}
          setNewCatTypeId={setNewCatTypeId}
          setShowCatModal={setShowCatModal}
          t={t}
        />
      )}

      {/* ══ CONFIRM DELETE FEED ══ */}
      {confirmDeleteFeed && (
        <DeleteFeedDialog
          confirmDeleteFeed={confirmDeleteFeed}
          deletingFeedId={deletingFeedId}
          handleDeleteFeed={handleDeleteFeed}
          setConfirmDeleteFeed={setConfirmDeleteFeed}
          t={t}
        />
      )}

      {/* ══ CONFIRM DELETE TYPE ══ */}
      {confirmDeleteType && (
        <DeleteFeedTypeDialog
          confirmDeleteType={confirmDeleteType}
          deletingTypeId={deletingTypeId}
          getName={getName}
          handleDeleteType={handleDeleteType}
          setConfirmDeleteType={setConfirmDeleteType}
          t={t}
        />
      )}

      {/* ══ CONFIRM DELETE CATEGORY ══ */}
      {confirmDeleteCat && (
        <DeleteFeedCategoryDialog
          confirmDeleteCat={confirmDeleteCat}
          deletingCatId={deletingCatId}
          getCatName={getCatName}
          handleDeleteCategory={handleDeleteCategory}
          setConfirmDeleteCat={setConfirmDeleteCat}
          t={t}
        />
      )}
    </div>
  );
}

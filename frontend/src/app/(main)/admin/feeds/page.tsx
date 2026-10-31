"use client";

// ─── Types ────────────────────────────────────────────────────────────────────

import FeedTypeSheet from "@/components/admin/feeds/FeedTypeSheet";
import FeedCategorySheet from "@/components/admin/feeds/FeedCategorySheet";
import DeleteFeedDialog from "@/components/admin/feeds/DeleteFeedDialog";
import DeleteFeedTypeDialog from "@/components/admin/feeds/DeleteFeedTypeDialog";
import DeleteFeedCategoryDialog from "@/components/admin/feeds/DeleteFeedCategoryDialog";
import FeedFormSheet from "@/components/admin/feeds/FeedFormSheet";
import FeedsTab from "@/components/admin/feeds/FeedsTab";
import FeedsLanding from "@/components/admin/feeds/FeedsLanding";
import FeedTypesTab from "@/components/admin/feeds/FeedTypesTab";
import FeedCategoriesTab from "@/components/admin/feeds/FeedCategoriesTab";
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
  TabType,
  emptyFeedForm,
} from "@/components/admin/feeds/shared";
import { listFrom } from "@/lib/api-client/normalize";

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
        (fd) => listFrom<AdminFeed>(fd, "feeds", "items")
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
    return <FeedsLanding goToSection={goToSection} onBack={() => router.back()} t={t} />;
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
        <FeedsTab
          deletingFeedId={deletingFeedId}
          filteredFeeds={filteredFeeds}
          isLoading={isLoading}
          openAddFeed={openAddFeed}
          openEditFeed={openEditFeed}
          searchQuery={searchQuery}
          setConfirmDeleteFeed={setConfirmDeleteFeed}
          setSearchQuery={setSearchQuery}
          t={t}
        />
      )}

      {/* ── TYPES TAB ── (matches Android fragment_feed_type.xml +
          layout_item_feed_type.xml: card with name + status badge, description,
          delete (top-right). No search/filters; FAB for add.) */}
      {tab === "types" && (
        <FeedTypesTab
          deletingTypeId={deletingTypeId}
          feedTypes={feedTypes}
          getName={getName}
          isLoading={isLoading}
          setConfirmDeleteType={setConfirmDeleteType}
          setShowTypeModal={setShowTypeModal}
          t={t}
        />
      )}

      {/* ── CATEGORIES TAB ── (matches Android fragment_feed_category.xml +
          layout_item_feed_category.xml: name + status badge | TYPE | description
          + delete at bottom-right. No search/filters; FAB for add.) */}
      {tab === "categories" && (
        <FeedCategoriesTab
          deletingCatId={deletingCatId}
          feedCategories={feedCategories}
          getCatName={getCatName}
          getFeedTypeName={getFeedTypeName}
          isLoading={isLoading}
          setConfirmDeleteCat={setConfirmDeleteCat}
          setShowCatModal={setShowCatModal}
          t={t}
        />
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

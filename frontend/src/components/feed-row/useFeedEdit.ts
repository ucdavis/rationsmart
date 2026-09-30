"use client";

// FeedRow's edit sheet (Android DialogFeedDetails, isAdd=false): loading the
// feed's nutrients, the insert-vs-update decision and the save. Split out of
// FeedRow.tsx as a hook (audit B-17) — the row's JSX stays together (§14).

import { useState, type Dispatch, type SetStateAction } from "react";
import { checkInsertOrUpdate, getFeedDetails, insertCustomFeed, updateCustomFeed } from "@/lib/api";
import type { FeedItem } from "@/lib/api";
import type { User } from "@/lib/store";
import { anyNutrientInvalid, NUTRIENT_RANGE_MESSAGE } from "@/lib/validators";
import { useEscapeKey } from "@/lib/use-escape";
import { type NutrientKey } from "@/lib/nutrients";
import type { FeedSubCategoryItem } from "./useFeedCascade";

// Decimal-or-empty string for response numerics (matches Android
// formatFeedBreakdownData which strips trailing zeros/decimals).
function fmtNum(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "0";
  return String(parseFloat(n.toFixed(4)));
}

type Snackbar = (message: string, type?: "success" | "error" | "info") => void;

export interface FeedEditArgs {
  item: FeedItem;
  user: User | null;
  onUpdate: (id: string, updates: Partial<FeedItem>) => void;
  setSubCategories: Dispatch<SetStateAction<FeedSubCategoryItem[]>>;
  showSnackbar: Snackbar;
  t: (source: string) => string;
}

export function useFeedEdit({
  item,
  user,
  onUpdate,
  setSubCategories,
  showSnackbar,
  t,
}: FeedEditArgs) {
  // Edit feed bottom sheet — matches Android DialogFeedDetails with isAdd=false.
  // On open, calls /check-insert-or-update with countryId + feed_uuid:
  //   isInsert=true  → "Add Custom Feed" title, name editable with user prefix
  //   isInsert=false → "Edit Nutritional Information" title, name disabled,
  //                    prefix is the part before "-" in feedName (if present)
  // Nutrient layout (Additive/Mineral/General) is chosen by category.
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  useEscapeKey(showEditModal && !isSavingEdit, () => setShowEditModal(false));
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [editIsInsert, setEditIsInsert] = useState(false);
  const [editFeedName, setEditFeedName] = useState("");
  const [editNamePrefix, setEditNamePrefix] = useState("");
  const [editFeedDetailsExpanded, setEditFeedDetailsExpanded] = useState(true);
  const [editNutritionalInfoExpanded, setEditNutritionalInfoExpanded] = useState(true);
  const [editForm, setEditForm] = useState<Record<NutrientKey, string>>({
    fd_dm: "",
    fd_ash: "",
    fd_cp: "",
    fd_npn_cp: "",
    fd_ee: "",
    fd_st: "",
    fd_ndf: "",
    fd_adf: "",
    fd_lg: "",
    fd_ndin: "",
    fd_adin: "",
    fd_ca: "",
    fd_p: "",
  });

  const canEdit = !!item.feed_uuid;

  const openEditModal = async () => {
    if (!canEdit || !item.feed_uuid || !user?.country_id || !user?.id) return;
    setShowEditModal(true);
    setIsLoadingEdit(true);
    setEditForm({
      fd_dm: "",
      fd_ash: "",
      fd_cp: "",
      fd_npn_cp: "",
      fd_ee: "",
      fd_st: "",
      fd_ndf: "",
      fd_adf: "",
      fd_lg: "",
      fd_ndin: "",
      fd_adin: "",
      fd_ca: "",
      fd_p: "",
    });
    try {
      // Two calls: check (insert-vs-update) + feed-details (nutrient prefill).
      // The v1 check endpoint no longer returns nutrients, so we fetch them
      // from /feed-details separately. allSettled → details is best-effort;
      // a failed prefill just opens the form blank rather than aborting.
      const [checkRes, detailsRes] = await Promise.allSettled([
        checkInsertOrUpdate(user.country_id, item.feed_uuid, user.id),
        getFeedDetails(item.feed_uuid),
      ]);
      if (checkRes.status === "rejected") throw checkRes.reason;
      const data = checkRes.value.data;
      // v1 check endpoint returns { action, feed_id }: a non-owned (standard)
      // feed UUID → "insert" (editing creates a user-owned derivative), an
      // owned custom-feed UUID → "update". Fall back to the legacy booleans
      // for older backends.
      const isInsert = data?.action
        ? data.action === "insert"
        : (data?.is_insert ?? data?.insert_feed ?? false);
      // feed-details returns the English identity name as `fd_name`.
      const details = (
        detailsRes.status === "fulfilled" ? (detailsRes.value.data ?? {}) : {}
      ) as Record<string, unknown> & { fd_name?: string; feed_name?: string };
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
      const fullName =
        (details.fd_name as string) ??
        (details.feed_name as string) ??
        item.sub_category_name ??
        "";
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
      const msg = err instanceof Error ? err.message : t("Could not load feed details");
      showSnackbar(msg, "error");
      setShowEditModal(false);
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!user?.id || !user?.country_id || !item.feed_uuid) return;
    if (anyNutrientInvalid(Object.values(editForm))) {
      showSnackbar(t(NUTRIENT_RANGE_MESSAGE), "error");
      return;
    }
    setIsSavingEdit(true);
    try {
      // Mirror Android FeedDetailsViewModel: empty → 0.0 (toDoubleOrZero).
      const toNum = (v: string) => (v ? Number(v) : 0);
      const feed_details: Record<string, unknown> = {
        feed_name: `${editNamePrefix}${editFeedName.trim()}`,
        feed_type: item.feed_type_name ?? "",
        feed_category: item.category_name ?? "",
        // v1 backend requires fd_type/fd_category (or *_id) on custom-feed
        // insert/update; legacy (Android) accepted feed_type/feed_category.
        // Send both key sets using the English-source identity names.
        fd_type: item.feed_type_name ?? "",
        fd_category: item.category_name ?? "",
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
        const newName =
          (res.data?.feed_details?.feed_name as string) ??
          `${editNamePrefix}${editFeedName.trim()}`;
        const newId = res.data?.feed_details?.feed_id as string | undefined;
        if (!newId) {
          // Saved, but the response didn't say which feed_id it got. Don't
          // fall back to the ORIGINAL feed's uuid — the row would show the
          // new name while still being bound to the old feed (audit B-04).
          showSnackbar(t("Custom feed saved"), "success");
          setShowEditModal(false);
          return;
        }
        // Android DialogFeedDetails repopulates the spinner after insert
        // so the new feed becomes the selected option. We mirror that
        // by appending the new entry to the local sub-category list
        // *before* committing the row update — otherwise CustomSelect
        // can't find feed_uuid in its options and falls back to the
        // "Select feed" placeholder until the next cascade refetch.
        setSubCategories((prev) =>
          prev.some((s) => s.feed_uuid === newId)
            ? prev
            : // New custom feed — no server translation exists yet, so
              // display_name is just the entered English name.
              [...prev, { feed_name: newName, feed_uuid: newId, display_name: newName }]
        );
        onUpdate(item.id, {
          sub_category_id: 1,
          sub_category_name: newName,
          feed_uuid: newId,
          display_name: newName,
        });
        showSnackbar(t("Custom feed saved"), "success");
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
            prev.map((s) => (s.feed_uuid === item.feed_uuid ? { ...s, feed_name: updatedName } : s))
          );
          onUpdate(item.id, { sub_category_name: updatedName });
        }
        showSnackbar(t("Nutritional values updated"), "success");
      }
      setShowEditModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("Update failed");
      showSnackbar(msg, "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  return {
    canEdit,
    showEditModal,
    openEditModal,
    dialogProps: {
      editFeedDetailsExpanded,
      editFeedName,
      editForm,
      editIsInsert,
      editNamePrefix,
      editNutritionalInfoExpanded,
      handleEditSubmit,
      isLoadingEdit,
      isSavingEdit,
      item,
      setEditFeedDetailsExpanded,
      setEditFeedName,
      setEditForm,
      setEditNutritionalInfoExpanded,
      setShowEditModal,
    },
  };
}

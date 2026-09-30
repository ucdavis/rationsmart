"use client";

// Custom Feed bottom sheet — state and the load / save flow (Android
// DialogAddCustomFeed). Split out of feed-selection/page.tsx (audit B-17).

import { useState } from "react";
import {
  checkInsertOrUpdate,
  getFeedCategories,
  getFeedTypes,
  insertCustomFeed,
  parseFeedCategoryOptions,
  parseFeedTypeOptions,
  updateCustomFeed,
} from "@/lib/api";
import type { User } from "@/lib/store";
import { anyNutrientInvalid, NUTRIENT_RANGE_MESSAGE } from "@/lib/validators";
import { useEscapeKey } from "@/lib/use-escape";
import { EMPTY_CUSTOM, type CustomFeedSheetProps } from "./CustomFeedSheet";

type Snackbar = (message: string, type?: "success" | "error" | "info") => void;

export function useCustomFeed(user: User | null, t: (s: string) => string, showSnackbar: Snackbar) {
  // Custom Feed modal state
  const [showCustomFeedModal, setShowCustomFeedModal] = useState(false);
  useEscapeKey(!!showCustomFeedModal, () => setShowCustomFeedModal(false));
  // Two collapsible sections, both expanded by default (matches Android
  // DialogFeedDetails isFeedDetailsExpanded/isNutritionalInfoExpanded = true).
  const [feedDetailsExpanded, setFeedDetailsExpanded] = useState(true);
  const [nutritionalInfoExpanded, setNutritionalInfoExpanded] = useState(true);
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
      showSnackbar(t("Country info missing. Please update your profile."), "error");
      return;
    }
    setShowCustomFeedModal(true);
    setLoadingCustomTypes(true);
    try {
      const res = await getFeedTypes(user.country_id, user.id);
      const names = parseFeedTypeOptions(res.data).map((o) => o.name);
      setCustomFeedTypes(names);
    } catch {
      showSnackbar(t("Could not load feed types"), "error");
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
      const names = parseFeedCategoryOptions(res.data).map((o) => o.name);
      setCustomFeedCategories(names);
    } catch {
      showSnackbar(t("Could not load categories"), "error");
    } finally {
      setLoadingCustomCats(false);
    }
  };

  const handleSaveCustomFeed = async () => {
    if (!user?.id || !user?.country_id) return;
    if (!customFeedForm.feed_name.trim() || !customFeedForm.feed_type) {
      showSnackbar(t("Feed name and type are required"), "error");
      return;
    }
    if (
      anyNutrientInvalid(
        Object.entries(customFeedForm)
          .filter(([k]) => k.startsWith("fd_"))
          .map(([, v]) => v as string)
      )
    ) {
      showSnackbar(t(NUTRIENT_RANGE_MESSAGE), "error");
      return;
    }
    setIsSavingCustom(true);
    try {
      // Match Android FeedDetailsViewModel.insertFeed payload: numeric fields
      // default to 0.0 (toDoubleOrZero) for any nutrient the chosen layout
      // does not surface. We mirror that — empty inputs become 0.
      const toNum = (v: string) => (v ? Number(v) : 0);
      const feedDetails = {
        feed_name: customFeedForm.feed_name.trim(),
        feed_type: customFeedForm.feed_type,
        feed_category: customFeedForm.feed_category,
        // v1 backend requires fd_type/fd_category (or the *_id variants) on
        // custom-feed insert/update. The legacy backend (which Android targets
        // via InsertFeedDetails: feed_type/feed_category) did not, so Android
        // parity alone isn't enough here — we send BOTH the English-source
        // identity names under each key set. Values are the English source
        // (from getFeedTypes/getFeedCategories with lang=en), never display_*.
        fd_type: customFeedForm.feed_type,
        fd_category: customFeedForm.feed_category,
        country_code: user.country_code ?? "",
        country_name: user.country ?? "",
        fd_dm: toNum(customFeedForm.fd_dm),
        fd_ash: toNum(customFeedForm.fd_ash),
        fd_cp: toNum(customFeedForm.fd_cp),
        fd_npn_cp: toNum(customFeedForm.fd_npn_cp),
        fd_ee: toNum(customFeedForm.fd_ee),
        fd_st: toNum(customFeedForm.fd_st),
        fd_ndf: toNum(customFeedForm.fd_ndf),
        fd_adf: toNum(customFeedForm.fd_adf),
        fd_lg: toNum(customFeedForm.fd_lg),
        fd_ndin: toNum(customFeedForm.fd_ndin),
        fd_adin: toNum(customFeedForm.fd_adin),
        fd_ca: toNum(customFeedForm.fd_ca),
        fd_p: toNum(customFeedForm.fd_p),
      };

      // Check if it already exists
      let isUpdate = false;
      let existingFeedId = "";
      try {
        const checkRes = await checkInsertOrUpdate(
          user.country_id,
          customFeedForm.feed_name.trim(),
          user.id
        );
        // v1 check endpoint returns { action: "insert"|"update", feed_id }.
        // It's UUID-based, so a name string (what we pass here) always yields
        // "insert" — the sheet is an add-flow, so that's the intended path.
        const checkData = checkRes.data;
        isUpdate = checkData?.action === "update";
        existingFeedId = checkData?.feed_id ?? "";
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
        showSnackbar(t("Custom feed updated!"), "success");
      } else {
        await insertCustomFeed({
          country_id: user.country_id,
          user_id: user.id,
          feed_insert: true,
          feed_details: feedDetails,
        });
        showSnackbar(t("Custom feed saved! It will appear in the feed list."), "success");
      }
      setShowCustomFeedModal(false);
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : t("Failed to save custom feed"), "error");
    } finally {
      setIsSavingCustom(false);
    }
  };

  const sheetProps: Omit<CustomFeedSheetProps, "t" | "user"> = {
    customFeedCategories,
    customFeedForm,
    customFeedTypes,
    feedDetailsExpanded,
    handleCustomTypeChange,
    handleSaveCustomFeed,
    isSavingCustom,
    loadingCustomCats,
    loadingCustomTypes,
    nutritionalInfoExpanded,
    setCustomFeedForm,
    setFeedDetailsExpanded,
    setNutritionalInfoExpanded,
    setShowCustomFeedModal,
  };
  return { showCustomFeedModal, openCustomFeedModal, sheetProps };
}

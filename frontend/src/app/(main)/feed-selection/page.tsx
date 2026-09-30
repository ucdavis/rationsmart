"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import FeedRow from "@/components/FeedRow";
import Toolbar from "@/components/Toolbar";
import GeneratingReportDialog from "@/components/GeneratingReportDialog";
import { evaluateDiet, recommendDiet, getCountries } from "@/lib/api";
import type { DietLimits, FeedSearchResult } from "@/lib/api";
import { IcAddFeed } from "@/components/Icons";
import { useT } from "@/lib/i18n-ui";
import { COLUMN_WIDTH } from "@/lib/column";
import { useEscapeKey } from "@/lib/use-escape";
import { SCROLL_AFTER_RENDER_MS } from "@/lib/ui-timings";
import { COLORS } from "@/lib/colors";
import {
  buildEvaluationRequest,
  buildRecommendationRequest,
  checkedLimits,
} from "@/lib/diet-request";
import { useFeedSearch } from "@/components/feed-selection/useFeedSearch";
import IncompleteFeedsDialog from "@/components/feed-selection/IncompleteFeedsDialog";
import NoForageDialog from "@/components/feed-selection/NoForageDialog";
import DietLimitsSheet from "@/components/feed-selection/DietLimitsSheet";
import CustomFeedSheet from "@/components/feed-selection/CustomFeedSheet";
import FeedSearchPanel from "@/components/feed-selection/FeedSearchPanel";
import OptionalToolsRow from "@/components/feed-selection/OptionalToolsRow";
import { useCustomFeed } from "@/components/feed-selection/useCustomFeed";
import { useDietLimitSpecs } from "@/components/feed-selection/useDietLimitSpecs";
import { useFeedItems, useFeedTaxonomyLabels } from "@/components/feed-selection/useFeedItems";
import {
  generatePreflight,
  limitOutOfRange,
  ndfFloorAboveCeiling,
} from "@/components/feed-selection/preflight";

// Custom Diet Limits rows are NOT hardcoded any more. They are built from
// GET /v1/animal/diet-thresholds for the simulation's physiological state,
// which returns each limit's default, accepted range, unit, direction and
// enforcement. The old hardcoded table (ash 0–15, ee 0–7, ndf 0–100,
// starch 0–30) is gone for three reasons:
//   * min 0 is now rejected with a 422 — a zero limit degenerates the solve.
//   * ndf 100 / starch 30 exceed the lactating ceilings (60 / 26), so the
//     dialog was offering values the backend refuses.
//   * the ranges differ per state and get retuned; a copy in the client
//     drifts silently, which is the exact failure this endpoint fixes.
// When the endpoint can't be reached we DISABLE the dialog rather than fall
// back to a guess — we'd only be offering ranges we know to be wrong.

// Custom feed form — keys mirror Android FeedDetailsViewModel fields.
// Android DialogFeedDetails only shows the 13 nutrients listed below
// (Additive layout = all 13; General omits NPN; Mineral keeps only 4).

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
    setUser,
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
    setUser: s.setUser,
    showSnackbar: s.showSnackbar,
  }));

  // Use the user's currency CODE directly (PHP / INR / VND / …) so the
  // Price field label reads e.g. "Price PHP/KG", matching Android.
  const currencySymbol = user?.currency ?? "";

  // UI-label i18n — this screen (and FeedRow) resolve language from the
  // PER-SIMULATION override (cattleInfo.simulation_language), not the
  // profile-wide user.preferred_language, matching the exact priority
  // chain the feed-data i18n langProvider already uses in store.ts.
  // See src/lib/i18n-ui.ts's doc comment on the `langOverride` param.
  const t = useT(cattleInfo?.simulation_language ?? user?.preferred_language ?? "en");

  const { items, setItems, loadingRows, handleCascadeLoading, addFeed, updateItem, deleteItem } =
    useFeedItems(feedSelections, setFeedSelections, showSnackbar, t);
  const taxonomyLabels = useFeedTaxonomyLabels(
    user?.country_id,
    cattleInfo?.simulation_language ?? null,
    user?.preferred_language ?? null
  );
  const {
    showCustomFeedModal,
    openCustomFeedModal,
    sheetProps: customFeedSheetProps,
  } = useCustomFeed(user, t, showSnackbar);
  const [isLoading, setIsLoading] = useState(false);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  useEscapeKey(!!showLimitsModal, () => setShowLimitsModal(false));
  const [limits, setLimits] = useState<Partial<DietLimits>>(dietLimits);
  const [showIncompleteFeedsDialog, setShowIncompleteFeedsDialog] = useState(false);
  useEscapeKey(!!showIncompleteFeedsDialog, () => setShowIncompleteFeedsDialog(false));
  // Y3 — diet optimization / evaluation requires at least one Forage
  // ingredient. The block fires before generate when none is present.
  const [showNoForageDialog, setShowNoForageDialog] = useState(false);
  useEscapeKey(!!showNoForageDialog, () => setShowNoForageDialog(false));
  const [incompleteFeedNames, setIncompleteFeedNames] = useState<string[]>([]);

  // Y3 §1.1.1 — single page-level search bar. The user taps a FeedRow
  // card to mark it as the "search target" (activeRowId); typing a
  // query + tapping a result then populates that card. If no card is
  // explicitly active when the user picks a result, fall back to the
  // first row without a feed_uuid (or row 1 if all are populated).
  const search = useFeedSearch(user);
  const { setSearchQuery, setSearchOpen, jumpToSearch: handleJumpToSearch } = search;
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  // Apply the picked result to the targeted row. Target priority:
  //   1. The explicitly-tapped activeRowId, if any
  //   2. The first row whose feed_uuid is still null (empty row)
  //   3. Row 0 as the final fallback
  const applySearchResult = (result: FeedSearchResult) => {
    // Resolve the target row from CURRENT state BEFORE setItems. The setItems
    // updater runs during React's render phase — i.e. AFTER the synchronous
    // setActiveRowId / snackbar calls below — so anything computed inside it
    // would still be stale here. Compute landedRowId/landedIdx up front.
    let idx = activeRowId ? items.findIndex((r) => r.id === activeRowId) : -1;
    const usedFallback = idx === -1;
    if (idx === -1) idx = items.findIndex((r) => !r.feed_uuid);
    if (idx === -1) idx = 0;
    const landedIdx = idx;
    const landedRowId = items[idx]?.id ?? null;

    setItems((prev) => {
      const next = prev.map((row) =>
        row.id === landedRowId
          ? {
              ...row,
              feed_type_name: result.feed_type,
              category_name: result.feed_category,
              sub_category_name: result.feed_name,
              feed_uuid: result.feed_uuid,
              sub_category_id: 1,
              // i18n V2 — capture the translated name for the /report
              // fallback. searchFeeds always populates display_name
              // (falls back to English source if no translation exists).
              display_name: result.display_name ?? result.feed_name,
              // FeedRow's cascade `useEffect`s will repopulate the *_id
              // fields when the dropdown lists arrive — leaving them
              // null here would clear them prematurely.
            }
          : row
      );
      return next;
    });
    setSearchQuery("");
    setSearchOpen(false);
    // Keep the green focus ring on the card the feed just landed in, so the
    // user can see WHICH card they filled. Previously this was cleared to
    // null, so after a search the feed appeared in the card with no
    // indication of where it went. The highlighted card also remains the
    // active search target — tap another card to retarget. Scroll it into
    // view so control visibly returns to the card once the panel closes.
    setActiveRowId(landedRowId);
    if (landedRowId) {
      const rowId = landedRowId;
      setTimeout(() => {
        document
          .getElementById(`feed-card-${rowId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, SCROLL_AFTER_RENDER_MS);
    }

    // When the user did NOT tap a card before searching, the result lands in
    // the first empty row. The ring + scroll now point there too, but keep a
    // confirming snackbar for that no-tap case.
    if (usedFallback && landedIdx >= 0) {
      showSnackbar(t("Added to FEED ${N}").replace("${N}", String(landedIdx + 1)), "success");
    }
  };

  const isEvaluation = feedSelectionType === "evaluation";

  // ─── Custom Diet Limits — discover what this animal may override ─────────
  // A "Baby Calf/Heifer" is answered with a milk-feeding schedule rather than
  // a formulated ration, so it has no editable limits at all and the endpoint
  // returns 422 for it. Hide the whole control rather than offering one that
  // can only fail.
  const animalCategory = cattleInfo?.animal_category ?? "Lactating Cow";
  const limitsApplyToAnimal = animalCategory !== "Baby Calf/Heifer";

  const { limitSpecs, limitSpecsError } = useDietLimitSpecs(
    animalCategory,
    limitsApplyToAnimal,
    user
  );

  const limitSpecsLoading = limitsApplyToAnimal && !limitSpecs && !limitSpecsError;
  // Evaluation doesn't run the optimizer, so limits have nothing to act on.
  const limitsDisabled = isEvaluation || !limitSpecs;

  const isValid = () => {
    if (!cattleInfo) return false;
    // Block the Generate button while ANY row is still resolving its
    // cascade fetches. This matters most for history-restored sessions:
    // the FeedRow effects re-fetch type/category/feed options and need
    // to validate stored names against the live response before the
    // payload is safe to send. Sending mid-load could ship an obsolete
    // feed_uuid the backend has since removed/renamed.
    if (loadingRows.size > 0) return false;
    // Saved Custom Diet Limits are range-checked against the per-state spec
    // before sending, so wait for it rather than send unchecked limits (or
    // silently drop them) during the brief fetch window.
    if (!isEvaluation && limitSpecsLoading && Object.keys(limits).length > 0) return false;
    // Validate on the NAME fields, not the *_id fields. The id values are
    // looked up after the cascade dropdowns load, so a search-picked row
    // has names set immediately but ids only after a brief async fill.
    // The payload itself only uses feed_uuid + price_per_kg, so the ids
    // are purely UI-state — gating on names is the right semantic.
    return items.some(
      (item) =>
        item.feed_uuid !== null &&
        !!item.feed_type_name &&
        !!item.category_name &&
        item.price_per_kg !== null &&
        (!isEvaluation || item.quantity_kg !== null)
    );
  };

  const handleGenerateClick = () => {
    const check = generatePreflight({
      items,
      isEvaluation,
      taxonomyTypes: taxonomyLabels.types,
      limits,
      limitSpecs,
      animalCategory,
      t,
    });
    if (check.kind === "incomplete") {
      setIncompleteFeedNames(check.names);
      setShowIncompleteFeedsDialog(true);
    } else if (check.kind === "noForage") {
      setShowNoForageDialog(true);
    } else if (check.kind === "error") {
      showSnackbar(check.message, "error");
    } else {
      void generateReport();
    }
  };

  const generateReport = async () => {
    if (!cattleInfo || !user) return;
    setIsLoading(true);
    try {
      // The saved limits themselves are kept for the next run; only the
      // spec-checked subset is sent. When the spec fetch FAILED nothing
      // could be checked, so none are sent and the user is told.
      const limitsSkipped =
        limitsApplyToAnimal && !!limitSpecsError && Object.keys(limits).length > 0;

      if (isEvaluation) {
        // Evaluation prices the diet, so it needs a currency. Accounts
        // persisted before currency was stored have none: derive it from
        // the simulation's country (and remember it), or stop and say so
        // rather than silently pricing in USD (audit D-03).
        let currency = user.currency;
        if (!currency) {
          try {
            const res = await getCountries();
            currency =
              (res.data ?? []).find((c) => String(c.id) === String(cattleInfo.country_id))
                ?.currency ?? "";
            if (currency) setUser({ ...user, currency });
          } catch {
            currency = "";
          }
        }
        if (!currency) {
          showSnackbar(
            t("Your country's currency is unknown — pick your country in Profile, then try again."),
            "error"
          );
          return;
        }
        const res = await evaluateDiet(
          buildEvaluationRequest({ ...user, currency }, cattleInfo, items)
        );
        setReportData({ ...res.data, mode: "evaluation" });
      } else {
        const res = await recommendDiet(
          buildRecommendationRequest(user, cattleInfo, items, checkedLimits(limits, limitSpecs))
        );
        if (limitsSkipped) {
          showSnackbar(
            t("Diet limits unavailable — report generated with the default limits."),
            "info"
          );
        }
        setReportData({ ...res.data, mode: "recommendation" });
      }
      setDietLimits(limits);
      router.push("/report");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("Failed to generate report");
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

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("Feed Selection")} onBack={() => router.back()} />

      <OptionalToolsRow
        limitsApplyToAnimal={limitsApplyToAnimal}
        limitsDisabled={limitsDisabled}
        isEvaluation={isEvaluation}
        limitSpecsError={limitSpecsError}
        onOpenLimits={() => setShowLimitsModal(true)}
        onOpenCustomFeed={() => void openCustomFeedModal()}
        t={t}
      />

      {/* Radio group: Diet Recommendation | Diet Evaluation.
          Matches Android rg_feed_selection_type which is a horizontal
          RadioGroup with weightSum=2 + each RadioButton weight=1 — so
          each radio lines up under the button above it (Recommendation
          under Custom Diet Limits, Evaluation under Custom Feed). */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-1">
        {(["recommendation", "evaluation"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFeedSelectionType(mode)}
            className="flex items-center gap-2"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              justifyContent: "flex-start",
            }}
          >
            {/* Radio button */}
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: `2px solid ${feedSelectionType === mode ? COLORS.darkAquamarineGreen : COLORS.webDivider}`,
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
                    backgroundColor: COLORS.darkAquamarineGreen,
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: feedSelectionType === mode ? 700 : 400,
                color: feedSelectionType === mode ? COLORS.darkAquamarineGreen : COLORS.darkSilver,
                whiteSpace: "nowrap",
              }}
            >
              {mode === "recommendation" ? t("Diet Recommendation") : t("Diet Evaluation")}
            </span>
          </button>
        ))}
      </div>

      <FeedSearchPanel
        search={search}
        activeRowId={activeRowId}
        items={items}
        onPick={applySearchResult}
        t={t}
      />

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto px-3 pt-2" style={{ paddingBottom: 100 }}>
        <div className="space-y-3">
          {items.map((item, index) => (
            // id="feed-card-<id>" is the scroll target for the
            // "↓ JUMP TO CARD" pill in the search header.
            <div key={item.id} id={`feed-card-${item.id}`} style={{ scrollMarginTop: 12 }}>
              <FeedRow
                item={item}
                index={index}
                showQuantity={isEvaluation}
                currencySymbol={currencySymbol}
                isActive={activeRowId === item.id}
                onActivate={setActiveRowId}
                onCascadeLoading={handleCascadeLoading}
                onJumpToSearch={handleJumpToSearch}
                onUpdate={updateItem}
                onDelete={deleteItem}
                taxonomyLabels={taxonomyLabels}
              />
            </div>
          ))}
        </div>

        {/* Add More Feed button (dashed border) */}
        <button
          onClick={addFeed}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl mt-3 mb-3"
          style={{
            border: `2px dashed ${COLORS.darkAquamarineGreen}`,
            backgroundColor: "transparent",
            color: COLORS.darkAquamarineGreen,
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          <IcAddFeed size={20} color={COLORS.darkAquamarineGreen} />
          {t("Add More Feed")}
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
          maxWidth: COLUMN_WIDTH,
          backgroundColor: COLORS.white,
          borderTop: `1px solid ${COLORS.webDivider}`,
          zIndex: 30,
        }}
      >
        <button
          onClick={handleGenerateClick}
          disabled={!isValid() || isLoading}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-base"
          style={{
            backgroundColor:
              isValid() && !isLoading ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
            color: isValid() && !isLoading ? COLORS.white : COLORS.spanishGray,
            border: "none",
            cursor: isValid() && !isLoading ? "pointer" : "not-allowed",
            transition: "background-color 0.2s",
          }}
        >
          {/* Button text/icon stays unchanged while loading — the progress
              UI lives in the GeneratingReportDialog overlay below, matching
              Android dialog_generating_report (a modal MaterialAlertDialog
              shown for the duration of the API call). */}
          <span>
            {loadingRows.size > 0
              ? t("Loading feed data…")
              : isEvaluation
                ? t("Get Evaluation")
                : t("Generate Recommendation")}
          </span>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M4.5 9H13.5M10 5.5L13.5 9L10 12.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Modal "Generating your report" dialog while recommendDiet /
          evaluateDiet is in flight. Mirrors Android dialog_generating_report. */}
      {isLoading && <GeneratingReportDialog />}

      {/* Custom Feed Modal — confined to the 480px centered column so the
          bottom sheet does not span the entire desktop viewport. */}
      {showCustomFeedModal && <CustomFeedSheet {...customFeedSheetProps} t={t} user={user} />}

      {/* Incomplete Feeds Dialog — confined to centered column */}
      {showIncompleteFeedsDialog && (
        <IncompleteFeedsDialog
          generateReport={generateReport}
          incompleteFeedNames={incompleteFeedNames}
          setShowIncompleteFeedsDialog={setShowIncompleteFeedsDialog}
          t={t}
        />
      )}

      {/* No-Forage Dialog — Y3 requirement. Same visual language as the
          Incomplete Feeds dialog so users recognise the pattern. */}
      {showNoForageDialog && (
        <NoForageDialog
          isEvaluation={isEvaluation}
          setShowNoForageDialog={setShowNoForageDialog}
          t={t}
        />
      )}

      {/* Custom Diet Limits Modal (bottom sheet) — confined to centered column */}
      {showLimitsModal && (
        <DietLimitsSheet
          limits={limits}
          limitSpecs={limitSpecs}
          ndfFloorAboveCeiling={ndfFloorAboveCeiling(limits)}
          limitOutOfRange={(spec) => limitOutOfRange(limits, spec)}
          updateLimit={updateLimit}
          setDietLimits={setDietLimits}
          setShowLimitsModal={setShowLimitsModal}
          showSnackbar={showSnackbar}
          t={t}
        />
      )}
    </div>
  );
}

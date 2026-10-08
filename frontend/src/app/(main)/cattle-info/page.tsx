"use client";

import SimulationHistorySheet from "@/components/cattle-info/SimulationHistorySheet";
import SimulationDetailsSection from "@/components/cattle-info/SimulationDetailsSection";
import AnimalSections from "@/components/cattle-info/AnimalSections";
import {
  type SimulationDetails,
  cattleInfoOf,
  isEvaluationRun,
  matchCountry,
  restoreDietLimits,
  restoreFeedItems,
  restoreForm,
  restoredStateOf,
} from "@/components/cattle-info/restore";
// ─── State-driven field spec (GET /v1/animal/cattle-info-fields) ────────────
// Which inputs render, what they prefill and what they accept all come from
// the backend per physiological state — nothing below hardcodes a default or
// a range. See getCattleInfoFields() in api.ts for the contract.

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useDrawer } from "@/lib/DrawerContext";
import { getCountries, getUserReports, getSimulationDetails, getCattleInfoFields } from "@/lib/api";
import type { AnimalCategory } from "@/lib/api";
import { useT } from "@/lib/i18n-ui";
import Toolbar from "@/components/Toolbar";
import { COLUMN_WIDTH } from "@/lib/column";
import { useEscapeKey } from "@/lib/use-escape";
import { ACTION_FEEDBACK_MS } from "@/lib/ui-timings";
import { COLORS } from "@/lib/colors";
import { useLatestRef } from "@/lib/use-latest";
import {
  Adjustments,
  Country,
  EMPTY_FORM,
  FieldSpecs,
  FormState,
  HistoryItem,
  applyDefaults,
  clampToSpecs,
  formToCattleInfo,
  toFormString,
  toSpecMap,
  specFieldsValid,
  withHiddenDefaults,
} from "@/components/cattle-info/form-model";

export default function CattleInfoPage() {
  const router = useRouter();
  const { openDrawer } = useDrawer();
  const {
    cattleInfo,
    setCattleInfo,
    user,
    setUser,
    showSnackbar,
    reportData,
    setReportData,
    setFeedSelections,
    setFeedSelectionType,
    setDietLimits,
  } = useStore((s) => ({
    setFeedSelections: s.setFeedSelections,
    setFeedSelectionType: s.setFeedSelectionType,
    setDietLimits: s.setDietLimits,
    cattleInfo: s.cattleInfo,
    setCattleInfo: s.setCattleInfo,
    user: s.user,
    setUser: s.setUser,
    showSnackbar: s.showSnackbar,
    reportData: s.reportData,
    setReportData: s.setReportData,
  }));

  const [form, setForm] = useState<FormState>(() => {
    if (cattleInfo) {
      return {
        simulation_name: cattleInfo.simulation_name ?? "",
        country_id: String(cattleInfo.country_id ?? user?.country_id ?? ""),
        country_name: cattleInfo.country ?? user?.country ?? "",
        // Raw values only. Once the state's spec loads, the mount effect
        // runs clampToSpecs over them — snapping 3 → "3.0" onto the milk
        // dropdowns and pulling anything a retuned range now rejects.
        breed: cattleInfo.breed ?? "",
        body_weight: toFormString(cattleInfo.body_weight),
        body_weight_gain: toFormString(cattleInfo.body_weight_gain),
        body_condition_score: toFormString(cattleInfo.body_condition_score),
        days_in_milk: toFormString(cattleInfo.days_in_milk),
        days_of_pregnancy: toFormString(cattleInfo.days_of_pregnancy),
        parity: toFormString(cattleInfo.parity),
        milk_production: toFormString(cattleInfo.milk_production),
        milk_protein_percent: toFormString(cattleInfo.milk_protein_percent),
        milk_fat_percent: toFormString(cattleInfo.milk_fat_percent),
        average_temperature: toFormString(cattleInfo.average_temperature),
        grazing: cattleInfo.grazing ?? false,
        distance_walked: cattleInfo.distance != null ? String(cattleInfo.distance) : "0",
        topography: cattleInfo.topography || "Flat",
        // Y3 §1.3 / §1.4 — fall back to defaults if a pre-Y3 cattleInfo
        // record is in storage (i.e. saved before these fields existed).
        milk_price: cattleInfo.milk_price != null ? String(cattleInfo.milk_price) : "",
        animal_category: cattleInfo.animal_category ?? "Lactating Cow",
        // i18n V2 — restore any per-simulation language previously chosen
        // for this run. Null on a pre-feature cattleInfo record; the
        // Language dropdown will show English selected in that case.
        simulation_language: cattleInfo.simulation_language ?? null,
      };
    }
    return {
      ...EMPTY_FORM,
      country_id: String(user?.country_id ?? ""),
      country_name: user?.country ?? "",
    };
  });

  // Field specs per physiological state, cached for the session so flipping
  // between states doesn't refetch. `specs` is the one for the form's CURRENT
  // state; undefined while it loads (or if it failed — the form then stays
  // shimmered and Continue disabled; there is deliberately no hardcoded
  // fallback, same rule as the Custom Diet Limits dialog).
  const [specCache, setSpecCache] = useState<Partial<Record<AnimalCategory, FieldSpecs>>>({});
  const specs = specCache[form.animal_category];
  const specCacheRef = useRef(specCache);
  specCacheRef.current = specCache;
  // Values clampToSpecs changed on restore: form key → the value it replaced.
  const [adjusted, setAdjusted] = useState<Adjustments>({});
  const [countries, setCountries] = useState<Country[]>([]);
  // Drives the Language field's loading skeleton below — see the fetch
  // effect and the render block for why this exists.
  const [loadingCountries, setLoadingCountries] = useState(true);

  // Single source of truth for "what language is this simulation
  // actually in right now" — used for the Language dropdown's displayed
  // value, the UI-label t() below, AND what gets saved on Continue.
  // Bug this fixes: the dropdown used to compute its OWN local fallback
  // (falling back to "en" in its `value` prop when the profile language
  // isn't in this country's supported_languages) WITHOUT writing that
  // fallback back into form.simulation_language. So a user whose
  // profile is Hindi, viewing a country that doesn't support Hindi,
  // would see the dropdown visually show "English" — while
  // form.simulation_language silently stayed null, handleContinue saved
  // null ("follow profile"), and feed-selection/report then resolved
  // that null straight to the Hindi profile language, showing Hindi
  // data right after a screen that visually said English. Computing
  // this ONCE and reusing it everywhere keeps the displayed value, the
  // live-translated labels, and the saved value always in agreement.
  const selectedCountryForLang = countries.find((c) => String(c.id) === form.country_id);
  // null = "no country matched at all yet" (countries hasn't loaded, or
  // form.country_id doesn't match anything) — stay PERMISSIVE in that
  // case (don't restrict), since we have no evidence the profile
  // language is actually invalid. Once a country IS matched, a MISSING
  // supported_languages field means "English only" (matching the same
  // `?? []` convention already used by the Country dropdown's onChange
  // handler below) — deliberately NOT treated as "unknown", since by
  // then we do have a real answer, just an English-only one. Without
  // the "no country matched at all" distinction, a fresh mount with no
  // country picked yet would wrongly force English before the user's
  // real profile language ever gets a chance to show.
  const languageOptionsForCountry = selectedCountryForLang
    ? ["en", ...(selectedCountryForLang.supported_languages ?? []).filter((c) => c !== "en")]
    : null;
  const rawSimulationLanguage = form.simulation_language || user?.preferred_language || "en";
  const effectiveSimulationLanguage = languageOptionsForCountry
    ? languageOptionsForCountry.includes(rawSimulationLanguage)
      ? rawSimulationLanguage
      : "en"
    : rawSimulationLanguage;

  // UI-label i18n — this screen (and feed-selection/report) uses its OWN
  // per-simulation language selection (the Language dropdown below,
  // `form.simulation_language`), not the profile-wide `user.preferred_language`
  // every other screen defaults to. Using effectiveSimulationLanguage
  // (not the raw form value) makes every t()-wrapped label on this page
  // re-translate the instant the user picks a different language from
  // the dropdown, before Continue is clicked — AND stays correct when
  // the profile language isn't valid for the selected country. See the
  // doc comment on useT() in src/lib/i18n-ui.ts.
  const t = useT(effectiveSimulationLanguage);
  const tRef = useLatestRef(t);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  useEscapeKey(!!showHistoryModal, () => setShowHistoryModal(false));
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loadingSimId, setLoadingSimId] = useState<string | null>(null);

  // Read, not re-run on: see useLatestRef (audit B-20).

  const effectInputs1 = useLatestRef({ t });
  useEffect(() => {
    const { t } = effectInputs1.current;
    getCountries()
      .then((res) => {
        const data = res.data;
        setCountries(Array.isArray(data) ? data : []);
      })
      .catch(() => showSnackbar(t("Could not load countries"), "error"))
      .finally(() => setLoadingCountries(false));
  }, [showSnackbar, effectInputs1]);

  // Resolves the spec for a state from cache, else fetches it. null on
  // failure (already reported). Never throws.
  const loadSpecs = async (state: AnimalCategory): Promise<FieldSpecs | null> => {
    const cached = specCacheRef.current[state];
    if (cached) return cached;
    try {
      const res = await getCattleInfoFields(state);
      const map = toSpecMap(res.data?.fields ?? []);
      setSpecCache((prev) => ({ ...prev, [state]: map }));
      return map;
    } catch {
      showSnackbar(t("Could not load cattle info fields"), "error");
      return null;
    }
  };

  const reportAdjustments = (adj: Adjustments) => {
    setAdjusted(adj);
    if (Object.keys(adj).length > 0) {
      showSnackbar(t("Some values were adjusted to fit the allowed range"), "info");
    }
  };

  // Mount: a fresh form takes the state's defaults; a form hydrated from the
  // store keeps its values and is only clamped (it may predate a retune).
  // The state-guard drops the result if the user changed state meanwhile.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs2 = useLatestRef({ cattleInfo, form, loadSpecs, reportAdjustments });
  useEffect(() => {
    const { cattleInfo, form, loadSpecs, reportAdjustments } = effectInputs2.current;
    const state = form.animal_category;
    const hydrated = !!cattleInfo;
    void loadSpecs(state).then((s) => {
      if (!s) return;
      if (!hydrated) {
        setForm((p) => (p.animal_category === state ? applyDefaults(p, s) : p));
        return;
      }
      // Animal fields are disabled until the spec arrives, so the mount-time
      // `form` still holds exactly the values being clamped — safe to derive
      // the adjustment report from it while the updater clamps `p` (which may
      // carry a Simulation Name typed in the meantime).
      setForm((p) => (p.animal_category === state ? clampToSpecs(p, s).form : p));
      reportAdjustments(clampToSpecs(form, s).adjusted);
    });
    // Mount-only by design: state changes go through handleStateChange, and
    // restores through loadSimulation — each applies its own rule.
  }, [effectInputs2]);

  // User picked a physiological state → every animal field takes the new
  // state's default. Name, country and language are left alone.
  const handleStateChange = async (next: AnimalCategory) => {
    setForm((p) => ({ ...p, animal_category: next }));
    setAdjusted({});
    const s = await loadSpecs(next);
    if (!s) return;
    setForm((p) => (p.animal_category === next ? applyDefaults(p, s) : p));
  };

  useEffect(() => {
    if (!showHistoryModal || !user) return;
    setIsLoadingHistory(true);
    getUserReports(user.id)
      .then((res) => {
        const data = res.data;
        // API returns { simulations: [...], success: bool }
        setHistoryList(Array.isArray(data) ? data : (data?.simulations ?? []));
      })
      .catch(() => showSnackbar(tRef.current("Could not load history"), "error"))
      .finally(() => setIsLoadingHistory(false));
  }, [showHistoryModal, user, showSnackbar, tRef]);

  const loadSimulation = async (reportId: string) => {
    if (!user || !reportId) return;
    setLoadingSimId(reportId);
    try {
      const res = await getSimulationDetails(reportId, user.id);
      const data = res.data;
      const details: SimulationDetails = data ?? {};
      const matchedCountry = matchCountry(countries, details.country_name ?? "");
      const restoredState = restoredStateOf(cattleInfoOf(details), form.animal_category);
      // The RESTORED state's spec, not the current form's — the ranges being
      // clamped against are the ones the simulation will be re-run under.
      const restoredSpecs = await loadSpecs(restoredState);
      // Anything the simulation doesn't carry falls back to the restored
      // state's default rather than whatever the previous case left behind.
      const prev: FormState = restoredSpecs
        ? applyDefaults({ ...form, animal_category: restoredState }, restoredSpecs)
        : form;
      const restoredForm = restoreForm(details, prev, matchedCountry, restoredState);
      // FE-4: a stored value the current ranges reject (most often milk
      // protein 2.5 — the old default, now below the 2.6 floor) is pulled
      // into range and flagged, rather than silently edited or left to 422.
      const clamped = restoredSpecs
        ? clampToSpecs(restoredForm, restoredSpecs)
        : { form: restoredForm, adjusted: {} };
      setForm(clamped.form);

      // Feed Selection picks the restored rows up from the store on mount.
      const restoredItems = restoreFeedItems(details, Date.now());
      if (restoredItems.length > 0) {
        setFeedSelections(restoredItems);
        setFeedSelectionType(isEvaluationRun(details) ? "evaluation" : "recommendation");
      } else {
        // Empty simulation — reset so we don't carry over a previous case.
        setFeedSelections([]);
      }
      // A run without custom limits clears any carried over from the last case.
      setDietLimits(restoreDietLimits(details));

      // Scenario 4 — push the restored values to the store's cattleInfo so
      // BOTH screens see the restore (langProvider and the report read it).
      setCattleInfo({
        ...formToCattleInfo(
          restoredSpecs ? withHiddenDefaults(clamped.form, restoredSpecs) : clamped.form,
          // Same language the restored form shows (QA row 2).
          clamped.form.simulation_language ?? null
        ),
        // Deliberately left blank on restore — see restoreForm.
        simulation_name: "",
        country: matchedCountry?.name ?? details.country_name ?? "",
        country_id: matchedCountry ? String(matchedCountry.id) : "",
      });

      showSnackbar(t("Simulation loaded successfully"), "success");
      reportAdjustments(clamped.adjusted);
      setShowHistoryModal(false);
    } catch {
      showSnackbar(t("Could not load simulation details"), "error");
    } finally {
      setLoadingSimId(null);
    }
  };

  // Editing a field clears its "adjusted on restore" flag.
  const set = (key: keyof FormState) => (val: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setAdjusted((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const fieldsLoading = loadingCountries || !specs;

  const requiredFilled =
    form.simulation_name.trim() !== "" && form.country_id !== "" && specFieldsValid(form, specs, t);

  const handleContinue = () => {
    if (!requiredFilled) return;
    const selectedCountry = countries.find((c) => String(c.id) === String(form.country_id));
    // Sync the user's active currency / country code with the country
    // they just picked. Without this, feed-selection / report would
    // keep showing the currency that was set at login (e.g. user logs
    // in as Vietnam → switches to India here → feed-selection still
    // reads user.currency = "VND" → labels stay "Price VND/KG").
    if (
      user &&
      selectedCountry &&
      (selectedCountry.currency !== user.currency ||
        String(selectedCountry.id) !== String(user.country_id))
    ) {
      setUser({
        ...user,
        country_id: String(selectedCountry.id),
        country: selectedCountry.name,
        country_code: selectedCountry.country_code ?? selectedCountry.code ?? user.country_code,
        currency: selectedCountry.currency ?? user.currency,
      });
    }
    // FE-1 / D4: hidden fields go out as the spec default, never whatever
    // an earlier state left in the form.
    const submitForm = specs ? withHiddenDefaults(form, specs) : form;
    setCattleInfo({
      ...formToCattleInfo(submitForm, null),
      country: selectedCountry?.name ?? form.country_name,
      // i18n V2 — per-simulation language override. An explicit pick
      // (form.simulation_language set) is always valid for this country
      // since the dropdown only ever offers valid options — save it
      // verbatim. When untouched (null/""), save null ONLY if the
      // profile language is actually valid for this country (or we
      // don't know the country's supported_languages at all — stay
      // permissive), preserving "dynamically follow future profile
      // changes" for the common case; otherwise pin the resolved
      // fallback ("en") explicitly so this simulation never silently
      // ends up requesting a language the selected country doesn't
      // support (see effectiveSimulationLanguage above for the full
      // explanation of the bug this prevents).
      simulation_language: (() => {
        const resolved =
          form.simulation_language && form.simulation_language !== ""
            ? form.simulation_language
            : !languageOptionsForCountry ||
                languageOptionsForCountry.includes(user?.preferred_language ?? "en")
              ? null
              : effectiveSimulationLanguage;
        return resolved;
      })(),
    });
    // A calf only needs its milk amount — skip feed selection (QA row 8).
    router.push(form.animal_category === "Baby Calf/Heifer" ? "/calf-plan" : "/feed-selection");
  };

  // The reset itself finishes in microseconds; the user was reporting
  // they couldn't tell whether the button had done anything. This state
  // drives a short visual pulse — spinner + label change on the button
  // + a success snackbar after — so the reset is clearly acknowledged.
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = () => {
    if (isResetting) return;
    setIsResetting(true);
    // Fire the state resets immediately so the UI reflects the wipe
    // instantly (form fields go back to defaults, selection lists
    // empty). The spinner just holds visible for a moment so the user
    // gets clear feedback that Reset ran.
    const resetForm: FormState = {
      ...EMPTY_FORM,
      country_id: String(user?.country_id ?? ""),
      country_name: user?.country ?? "",
      // EMPTY_FORM.simulation_language is already null; being explicit
      // here so a future edit of EMPTY_FORM can't silently break Reset.
      simulation_language: null,
    };
    // Animal fields go back to the reset state's spec defaults — applied
    // synchronously when that spec is already cached (the usual case).
    const resetState = resetForm.animal_category;
    const cachedSpecs = specCacheRef.current[resetState];
    setForm(cachedSpecs ? applyDefaults(resetForm, cachedSpecs) : resetForm);
    setAdjusted({});
    if (!cachedSpecs) {
      void loadSpecs(resetState).then((s) => {
        if (s) setForm((p) => (p.animal_category === resetState ? applyDefaults(p, s) : p));
      });
    }
    // Scenario 3 — Reset must clear BOTH screens' data. Beyond the
    // form / feed selections, we also null out cattleInfo in the store
    // so navigating away and back doesn't re-hydrate the previous
    // simulation's values into the form on mount. reportData is nulled
    // too so the forward arrow (which is gated on !!reportData) hides
    // and any stale report is gone.
    setFeedSelections([]);
    setFeedSelectionType("recommendation");
    setCattleInfo(null);
    setReportData(null);
    // 500ms is the sweet spot per Nielsen — long enough for the eye to
    // register the transition, short enough that the button doesn't
    // feel unresponsive.
    setTimeout(() => {
      setIsResetting(false);
      showSnackbar(t("Form reset"), "success");
    }, ACTION_FEEDBACK_MS);
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar
        type="home"
        title={t("Cattle Info")}
        onMenuOpen={openDrawer}
        showForward={!!reportData}
        onForward={() => router.push("/report")}
      />

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 90 }}>
        <SimulationDetailsSection
          form={form}
          setForm={setForm}
          set={set}
          countries={countries}
          loadingCountries={loadingCountries}
          languageOptionsForCountry={languageOptionsForCountry}
          effectiveSimulationLanguage={effectiveSimulationLanguage}
          onStateChange={(next) => void handleStateChange(next)}
          onOpenHistory={() => setShowHistoryModal(true)}
          t={t}
        />

        <AnimalSections
          form={form}
          setForm={setForm}
          set={set}
          specs={specs}
          adjusted={adjusted}
          setAdjusted={setAdjusted}
          fieldsLoading={fieldsLoading}
          currency={user?.currency}
          t={t}
        />
      </div>

      {/* Fixed bottom buttons */}
      <div
        className="flex items-center gap-3 px-4 py-4"
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
          onClick={handleReset}
          disabled={isResetting}
          className="py-3.5 rounded-2xl font-bold text-base inline-flex items-center justify-center gap-2"
          style={{
            border: `2px solid ${COLORS.darkAquamarineGreen}`,
            color: isResetting ? COLORS.darkSilver : COLORS.darkAquamarineGreen,
            background: isResetting ? COLORS.americanDiamond : COLORS.white,
            paddingLeft: isResetting ? 24 : 40,
            paddingRight: isResetting ? 24 : 40,
            cursor: isResetting ? "wait" : "pointer",
            transition: "background 0.15s, color 0.15s",
          }}
          aria-busy={isResetting}
        >
          {isResetting ? (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className="animate-spin"
                aria-hidden
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeDasharray="14 30"
                />
              </svg>
              {t("Resetting…")}
            </>
          ) : (
            t("Reset")
          )}
        </button>

        <button
          onClick={handleContinue}
          disabled={!requiredFilled}
          className="flex-1 py-3.5 rounded-2xl font-bold text-base"
          style={{
            backgroundColor: requiredFilled ? COLORS.darkAquamarineGreen : COLORS.lightGrayNew,
            color: requiredFilled ? COLORS.white : COLORS.spanishGray,
            border: "none",
            cursor: requiredFilled ? "pointer" : "not-allowed",
            transition: "background-color 0.2s, color 0.2s",
          }}
        >
          {form.animal_category === "Baby Calf/Heifer" ? t("Continue") : t("Continue to Feed")}
        </button>
      </div>

      {/* Simulation History Bottom-Sheet Modal */}
      {showHistoryModal && (
        <SimulationHistorySheet
          historyList={historyList}
          isLoadingHistory={isLoadingHistory}
          loadSimulation={loadSimulation}
          loadingSimId={loadingSimId}
          setShowHistoryModal={setShowHistoryModal}
          t={t}
        />
      )}
    </div>
  );
}

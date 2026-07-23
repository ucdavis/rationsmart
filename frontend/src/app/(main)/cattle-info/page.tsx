"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useDrawer } from "@/lib/DrawerContext";
import {
  getCountries,
  getUserReports,
  getSimulationDetails,
  ANIMAL_CATEGORIES,
  ANIMAL_CATEGORY_LABELS,
  isLactating,
  labelForLanguage,
} from "@/lib/api";
import type { AnimalCategory } from "@/lib/api";
import { useT } from "@/lib/i18n-ui";
import {
  containsMultipleDecimalPoints,
  getDecimalPointIndex,
  daysInMilkIsInRange,
  daysOfPregnancyIsInRange,
  scoreIsInRange,
  bodyWeightIsInRange,
  bodyWeightGainIsInRange,
  milkProductionIsInRange,
} from "@/lib/validators";
import SectionCard from "@/components/SectionCard";
import Toolbar from "@/components/Toolbar";
import CustomSelect from "@/components/CustomSelect";
import {
  IcSimulationDetails,
  IcSimulationHistory,
  IcAnimalCharacteristics,
  IcReproductiveData,
  IcMilkProduction,
  IcEnvironment,
  IcActiveGrazing,
} from "@/components/Icons";

const BREEDS = ["Holstein", "Crossbreed", "Indigenous"];
const PARITIES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const MILK_FAT_OPTIONS = ["3.5", "4.0", "4.5", "5.0", "5.5"];
const MILK_PROTEIN_OPTIONS = [
  "2.5",
  "2.6",
  "2.7",
  "2.8",
  "2.9",
  "3.0",
  "3.1",
  "3.2",
  "3.3",
  "3.4",
  "3.5",
  "3.6",
];

interface Country {
  id: string | number;
  name: string;
  code?: string;
  country_code?: string;
  currency?: string;
  // i18n V2 — BCP 47 codes the country has translations for. Drives the
  // Language dropdown options on this screen.
  supported_languages?: string[];
}

interface FormState {
  simulation_name: string;
  country_id: string;
  country_name: string;
  breed: string;
  body_weight: string;
  body_weight_gain: string;
  body_condition_score: string;
  days_in_milk: string;
  days_of_pregnancy: string;
  parity: string;
  milk_production: string;
  milk_protein_percent: string;
  milk_fat_percent: string;
  average_temperature: string;
  grazing: boolean;
  distance_walked: string; // km walked; shown when grazing=ON
  topography: string; // "Flat" or "Hilly"; shown when grazing=ON
  // Y3 §1.3 — milk price for §2.1 margin card. Optional (blank = null).
  milk_price: string;
  // Y3 §1.4 — drives form gating (hides Milk Production for non-lactating)
  // and report-side §2.3 section visibility.
  animal_category: AnimalCategory;
  // i18n V2 — per-simulation language override. null means "use the
  // user's profile language" (langProvider falls back). Selecting a
  // value here changes ?lang= for feed dropdowns / search / diet
  // endpoints for the duration of this simulation only. Never touches
  // the user's profile record.
  simulation_language: string | null;
}

interface HistoryItem {
  simulation_id?: string;
  report_id?: string;
  created_at?: string;
  country_name?: string;
  country?: string;
}

interface FieldErrors {
  body_condition_score?: string;
  body_weight?: string;
  body_weight_gain?: string;
  days_in_milk?: string;
  days_of_pregnancy?: string;
  milk_production?: string;
}

const EMPTY_FORM: FormState = {
  simulation_name: "",
  country_id: "",
  country_name: "",
  breed: "Holstein",
  body_weight: "500",
  body_weight_gain: "0.2",
  body_condition_score: "3.0",
  days_in_milk: "100",
  days_of_pregnancy: "40",
  parity: "1",
  milk_production: "15",
  // Defaults removed so the asterisk on Milk Protein % / Milk Fat %
  // actually gates the Continue button. The legacy build pre-filled
  // "3.0" / "3.5" which made the fields look mandatory but always
  // pass validation. User reported the mismatch.
  milk_protein_percent: "",
  milk_fat_percent: "",
  average_temperature: "25",
  grazing: false,
  distance_walked: "",
  topography: "Flat",
  // Y3 §1.3 — blank means user did not provide; payload sends null.
  milk_price: "",
  // Y3 §1.4 — default preserves existing behaviour (PWA was implicitly
  // lactating-cow-only before this change).
  animal_category: "Lactating Cow",
  // i18n V2 — null so langProvider falls back to profile default.
  simulation_language: null,
};

const inputStyle = {
  backgroundColor: "#F1F5F9",
  color: "#231F20",
  fontFamily: "Nunito, sans-serif",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  const cls = "text-xs font-bold uppercase tracking-wide mt-3 mb-1.5 ml-1";
  const style = { color: "#6D6D6D", fontFamily: "Nunito, sans-serif" };
  if (typeof children === "string" && children.endsWith(" *")) {
    return (
      <p className={cls} style={style}>
        {children.slice(0, -2)}
        <span style={{ color: "#FC2E20" }}>{" *"}</span>
      </p>
    );
  }
  return (
    <p className={cls} style={style}>
      {children}
    </p>
  );
}

// UX: shimmer the REAL form fields in place while getCountries is in
// flight, rather than swapping in a separately-built skeleton tree. A
// hand-approximated skeleton can drift from the actual field layout
// (spacing, conditional error rows, section field counts) and causes a
// layout jump the moment it's replaced. Reusing the real elements
// guarantees byte-identical layout before/after — only the appearance
// (shimmer background, hidden value, disabled) changes.
// Spread onto a native <input>/<textarea> alongside its normal
// className/style: `{...loadingFieldProps(loadingCountries, className, style)}`.
function loadingFieldProps(
  loading: boolean,
  className: string,
  style: React.CSSProperties
): { className: string; style: React.CSSProperties; disabled: boolean; tabIndex?: number } {
  if (!loading) return { className, style, disabled: false };
  return {
    className: `${className} shimmer`,
    style: { ...style, color: "transparent", caretColor: "transparent" },
    disabled: true,
    tabIndex: -1,
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs mt-1 ml-1" style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}>
      {message}
    </p>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  loading = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  // Outer gray-pill keeps the rounded chrome consistent with other fields;
  // CustomSelect renders its own zebra-striped popup matching Android's
  // DropDownListAdapter (mint/white alternating rows).
  // `loading`: same outer box (className unchanged apart from appending
  // "shimmer", which only touches background/animation) with the SAME
  // CustomSelect underneath — text hidden, interaction disabled — rather
  // than swapping in different markup, so there's no layout drift
  // between the loading and loaded states.
  return (
    <div
      className={`rounded-2xl px-4 py-3${loading ? " shimmer" : ""}`}
      style={loading ? undefined : { ...inputStyle, opacity: disabled ? 0.55 : 1 }}
    >
      <CustomSelect
        transparentTrigger
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder ?? "Select"}
        disabled={disabled}
        loading={loading}
      />
    </div>
  );
}

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
  } = useStore((s) => ({
    setFeedSelections: s.setFeedSelections,
    setFeedSelectionType: s.setFeedSelectionType,
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
        breed: cattleInfo.breed ?? "",
        body_weight: cattleInfo.body_weight ? String(cattleInfo.body_weight) : "",
        body_weight_gain: cattleInfo.body_weight_gain ? String(cattleInfo.body_weight_gain) : "",
        body_condition_score: cattleInfo.body_condition_score
          ? String(cattleInfo.body_condition_score)
          : "",
        days_in_milk: cattleInfo.days_in_milk !== undefined ? String(cattleInfo.days_in_milk) : "",
        days_of_pregnancy:
          cattleInfo.days_of_pregnancy !== undefined ? String(cattleInfo.days_of_pregnancy) : "",
        parity: cattleInfo.parity !== undefined ? String(cattleInfo.parity) : "",
        milk_production: cattleInfo.milk_production ? String(cattleInfo.milk_production) : "",
        milk_protein_percent: cattleInfo.milk_protein_percent
          ? String(cattleInfo.milk_protein_percent)
          : "",
        milk_fat_percent: cattleInfo.milk_fat_percent ? String(cattleInfo.milk_fat_percent) : "",
        average_temperature: cattleInfo.average_temperature
          ? String(cattleInfo.average_temperature)
          : "",
        grazing: cattleInfo.grazing ?? false,
        distance_walked: cattleInfo.distance != null ? String(cattleInfo.distance) : "0",
        topography: cattleInfo.topography ?? "Flat",
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

  const [errors, setErrors] = useState<FieldErrors>({});
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
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loadingSimId, setLoadingSimId] = useState<string | null>(null);
  // §1.2 Grazing info tooltip — tap-only (mobile-first). Click toggles.
  const [showGrazingTooltip, setShowGrazingTooltip] = useState(false);

  useEffect(() => {
    getCountries()
      .then((res) => {
        const data = res.data;
        setCountries(Array.isArray(data) ? data : []);
      })
      .catch(() => showSnackbar(t("Could not load countries"), "error"))
      .finally(() => setLoadingCountries(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSnackbar]);

  useEffect(() => {
    if (!showHistoryModal || !user) return;
    setIsLoadingHistory(true);
    getUserReports(user.id)
      .then((res) => {
        const data = res.data;
        // API returns { simulations: [...], success: bool }
        setHistoryList(Array.isArray(data) ? data : (data?.simulations ?? []));
      })
      .catch(() => showSnackbar(t("Could not load history"), "error"))
      .finally(() => setIsLoadingHistory(false));
  }, [showHistoryModal, user, showSnackbar]);

  const loadSimulation = async (reportId: string) => {
    if (!user || !reportId) return;
    setLoadingSimId(reportId);
    try {
      const res = await getSimulationDetails(reportId, user.id);
      const data = res.data;
      const ci = data?.cattle_info ?? data;
      const countryName = data?.country_name ?? "";
      const matchedCountry = countries.find(
        (c) => c.name?.toLowerCase() === countryName.toLowerCase()
      );
      setForm((prev) => ({
        ...prev,
        // Deliberately left blank on restore from Simulation History —
        // the backend echoes back exactly what we sent as simulation_id
        // (mode suffix included), and that's not a name the user should
        // see repopulated into the editable field. Every other field
        // still restores normally.
        simulation_name: "",
        country_id: matchedCountry ? String(matchedCountry.id) : prev.country_id,
        country_name: matchedCountry?.name ?? countryName ?? prev.country_name,
        breed: ci?.breed ?? prev.breed,
        body_weight: ci?.body_weight != null ? String(ci.body_weight) : prev.body_weight,
        body_weight_gain: ci?.bw_gain != null ? String(ci.bw_gain) : prev.body_weight_gain,
        body_condition_score:
          ci?.bc_score != null ? String(ci.bc_score) : prev.body_condition_score,
        days_in_milk: ci?.days_in_milk != null ? String(ci.days_in_milk) : prev.days_in_milk,
        days_of_pregnancy:
          ci?.days_of_pregnancy != null ? String(ci.days_of_pregnancy) : prev.days_of_pregnancy,
        parity: ci?.parity != null ? String(ci.parity) : prev.parity,
        milk_production:
          ci?.milk_production != null ? String(ci.milk_production) : prev.milk_production,
        milk_protein_percent: ci?.tp_milk != null ? String(ci.tp_milk) : prev.milk_protein_percent,
        milk_fat_percent: ci?.fat_milk != null ? String(ci.fat_milk) : prev.milk_fat_percent,
        average_temperature:
          ci?.temperature != null ? String(ci.temperature) : prev.average_temperature,
        grazing: ci?.grazing ?? prev.grazing,
        distance_walked: ci?.distance != null ? String(ci.distance) : prev.distance_walked,
        topography: ci?.topography ?? prev.topography,
        // Y3 §1.3 / §1.4 — restore Y3 fields from simulation when Maria's
        // backend echoes them back on /fetch-simulation-details. Until
        // then these reads will silently fall through to prev (unchanged).
        // TODO(maria-y3): confirm response keys for milk_price + animal_category.
        milk_price: ci?.milk_price != null ? String(ci.milk_price) : prev.milk_price,
        animal_category:
          (ci?.animal_category as AnimalCategory | undefined) ?? prev.animal_category,
        // i18n V2 — hydrate simulation_language from the restored
        // simulation. Priority chain:
        //   1. backend response's simulation_language (once shipped)
        //   2. current form's simulation_language (session continuity —
        //      if the user just came from the same country's run, keep
        //      the override they picked)
        //   3. first non-English supported_language on the restored
        //      country (best-effort guess for what the sim was likely
        //      run in — better than showing the user's profile default,
        //      which would be misleading for someone else's sim)
        //   4. null (falls back to profile via langProvider)
        // This gets the "restored sim shows its language, not profile"
        // behaviour EVEN before backend adds simulation_language on the
        // response.
        simulation_language: (() => {
          const fromBackend = data?.simulation_language as string | null | undefined;
          if (fromBackend) return fromBackend;
          if (prev.simulation_language) return prev.simulation_language;
          const primaryCountryLang = matchedCountry?.supported_languages?.find((c) => c !== "en");
          return primaryCountryLang ?? null;
        })(),
      }));

      // Populate Feed Selection from the simulation — matches Android
      // FeedViewModel.populateFromSimulation (FeedViewModel.kt:881-958)
      // which builds a feed list from simulationDetails.feedSelection
      // and pushes it to _feeds. PWA stores it on the Zustand store so
      // the feed-selection page picks it up on mount.
      const feedSelectionList = Array.isArray(data?.feed_selection) ? data.feed_selection : [];
      if (feedSelectionList.length > 0) {
        const restoredItems = feedSelectionList.map(
          (
            sel: {
              feed_type?: string;
              feed_category?: string;
              feed_name?: string;
              feed_id?: string;
              price_per_kg?: number | string | null;
              quantity_as_fed?: number | string | null;
              // Y3 §1.1.2 — backend may echo these on simulation restore.
              // TODO(maria-y3): confirm canonical keys on /fetch-simulation-details.
              min_kg_per_day?: number | string | null;
              max_kg_per_day?: number | string | null;
            },
            idx: number
          ) => {
            const minVal =
              sel.min_kg_per_day != null && sel.min_kg_per_day !== ""
                ? Number(sel.min_kg_per_day)
                : null;
            const maxVal =
              sel.max_kg_per_day != null && sel.max_kg_per_day !== ""
                ? Number(sel.max_kg_per_day)
                : null;
            return {
              id: `feed_restored_${idx}_${Date.now()}`,
              feed_type_id: sel.feed_type ? idx + 1 : null,
              feed_type_name: sel.feed_type ?? "",
              category_id: sel.feed_category ? idx + 1 : null,
              category_name: sel.feed_category ?? "",
              sub_category_id: sel.feed_id ? 1 : null,
              sub_category_name: sel.feed_name ?? "",
              feed_uuid: sel.feed_id ?? null,
              price_per_kg:
                sel.price_per_kg != null && sel.price_per_kg !== ""
                  ? Number(sel.price_per_kg)
                  : null,
              quantity_kg:
                sel.quantity_as_fed != null && sel.quantity_as_fed !== ""
                  ? Number(sel.quantity_as_fed)
                  : null,
              // Toggle defaults ON when either bound is present in the restored payload.
              inclusion_limits_enabled: minVal != null || maxVal != null,
              min_kg_per_day: minVal,
              max_kg_per_day: maxVal,
            };
          }
        );
        setFeedSelections(restoredItems);

        // Android: if every quantity_as_fed is null → Recommendation;
        // otherwise Evaluation (FeedViewModel.kt:894-900).
        const isEvaluation = feedSelectionList.some(
          (s: { quantity_as_fed?: number | string | null }) =>
            s.quantity_as_fed != null && s.quantity_as_fed !== ""
        );
        setFeedSelectionType(isEvaluation ? "evaluation" : "recommendation");
      } else {
        // Empty simulation — reset so we don't carry over a previous case.
        setFeedSelections([]);
      }

      // Scenario 4 — push the restored values to the store's cattleInfo
      // so BOTH screens see the restore. Without this, langProvider
      // reads the previous simulation's simulation_language when the
      // user navigates to /feed-selection, and any component reading
      // cattleInfo directly (e.g. report page context) sees stale data.
      const restoredSimulationLanguage = (() => {
        const fromBackend = data?.simulation_language as string | null | undefined;
        if (fromBackend) return fromBackend;
        const primaryCountryLang = matchedCountry?.supported_languages?.find((c) => c !== "en");
        return primaryCountryLang ?? null;
      })();
      setCattleInfo({
        // Deliberately left blank on restore — see the matching comment
        // on the setForm call above.
        simulation_name: "",
        country: matchedCountry?.name ?? countryName ?? "",
        country_id: matchedCountry ? String(matchedCountry.id) : "",
        breed: ci?.breed ?? "",
        body_weight: ci?.body_weight != null ? Number(ci.body_weight) : 0,
        body_weight_gain: ci?.bw_gain != null ? Number(ci.bw_gain) : 0,
        body_condition_score: ci?.bc_score != null ? Number(ci.bc_score) : 0,
        days_in_milk: ci?.days_in_milk != null ? Number(ci.days_in_milk) : 0,
        days_of_pregnancy: ci?.days_of_pregnancy != null ? Number(ci.days_of_pregnancy) : 0,
        parity: ci?.parity != null ? Number(ci.parity) : 1,
        milk_production: ci?.milk_production != null ? Number(ci.milk_production) : 0,
        milk_protein_percent: ci?.tp_milk != null ? Number(ci.tp_milk) : 0,
        milk_fat_percent: ci?.fat_milk != null ? Number(ci.fat_milk) : 0,
        average_temperature: ci?.temperature != null ? Number(ci.temperature) : 25,
        grazing: ci?.grazing ?? false,
        distance: ci?.distance != null ? Number(ci.distance) : 0,
        topography: ci?.topography ?? "Flat",
        milk_price: ci?.milk_price != null ? Number(ci.milk_price) : null,
        animal_category: (ci?.animal_category as AnimalCategory | undefined) ?? "Lactating Cow",
        simulation_language: restoredSimulationLanguage,
      });

      setErrors({});
      showSnackbar(t("Simulation loaded successfully"), "success");
      setShowHistoryModal(false);
    } catch {
      showSnackbar(t("Could not load simulation details"), "error");
    } finally {
      setLoadingSimId(null);
    }
  };

  const set = (key: keyof FormState) => (val: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const setError = (key: keyof FieldErrors, msg: string | undefined) =>
    setErrors((prev) => ({ ...prev, [key]: msg }));

  // Android body condition score validation
  const handleBCS = (input: string) => {
    if (!input) {
      set("body_condition_score")("");
      setError("body_condition_score", undefined);
      return;
    }
    if (input.startsWith(".")) return; // Android clears if starts with "."
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("body_condition_score")(input.slice(0, idx));
      return;
    }
    const val = parseFloat(input);
    if (!isNaN(val) && !scoreIsInRange(val)) {
      setError("body_condition_score", t("Value Range 1-5"));
    } else {
      setError("body_condition_score", undefined);
    }
    set("body_condition_score")(input);
  };

  // Android body weight validation
  const handleBodyWeight = (input: string) => {
    if (!input) {
      set("body_weight")("");
      setError("body_weight", undefined);
      return;
    }
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("body_weight")(input.slice(0, idx));
      return;
    }
    const val = parseFloat(input);
    if (!isNaN(val) && !bodyWeightIsInRange(val)) {
      setError("body_weight", t("Value Range 350-720"));
    } else {
      setError("body_weight", undefined);
    }
    set("body_weight")(input);
  };

  // Android body weight gain validation
  const handleBWGain = (input: string) => {
    if (!input) {
      set("body_weight_gain")("");
      setError("body_weight_gain", undefined);
      return;
    }
    if (input.startsWith(".")) return;
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("body_weight_gain")(input.slice(0, idx));
      return;
    }
    const val = parseFloat(input);
    if (!isNaN(val) && !bodyWeightGainIsInRange(val)) {
      setError("body_weight_gain", t("Value Range 0-1.8"));
    } else {
      setError("body_weight_gain", undefined);
    }
    set("body_weight_gain")(input);
  };

  // Android days in milk validation
  const handleDaysInMilk = (input: string) => {
    if (!input) {
      set("days_in_milk")("");
      setError("days_in_milk", undefined);
      return;
    }
    const val = parseInt(input);
    if (!isNaN(val) && !daysInMilkIsInRange(val)) {
      setError("days_in_milk", t("Value Range 0-400"));
    } else {
      setError("days_in_milk", undefined);
    }
    set("days_in_milk")(input);
  };

  // Android days of pregnancy validation
  const handleDaysOfPregnancy = (input: string) => {
    if (!input) {
      set("days_of_pregnancy")("");
      setError("days_of_pregnancy", undefined);
      return;
    }
    const val = parseInt(input);
    if (!isNaN(val) && !daysOfPregnancyIsInRange(val)) {
      setError("days_of_pregnancy", t("Value Range 0-280"));
    } else {
      setError("days_of_pregnancy", undefined);
    }
    set("days_of_pregnancy")(input);
  };

  // Android milk production validation
  const handleMilkProduction = (input: string) => {
    if (!input) {
      set("milk_production")("");
      setError("milk_production", undefined);
      return;
    }
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("milk_production")(input.slice(0, idx));
      return;
    }
    const val = parseFloat(input);
    if (!isNaN(val) && !milkProductionIsInRange(val)) {
      setError("milk_production", t("Value Range 1-59"));
    } else {
      setError("milk_production", undefined);
    }
    set("milk_production")(input);
  };

  // Android avg temperature validation (format only, no range error — but must be non-zero to enable button)
  const handleAvgTemp = (input: string) => {
    if (!input) {
      set("average_temperature")("");
      return;
    }
    if (input.startsWith(".")) return;
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("average_temperature")(input.slice(0, idx));
      return;
    }
    set("average_temperature")(input);
  };

  // Android distance walked validation (same as body weight format)
  const handleDistanceWalked = (input: string) => {
    if (!input) {
      set("distance_walked")("");
      return;
    }
    if (input === "0" || input.startsWith(".")) return;
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("distance_walked")(input.slice(0, idx));
      return;
    }
    set("distance_walked")(input);
  };

  const hasFieldErrors = Object.values(errors).some(Boolean);

  // Spec (Grazing contract): when grazing is ON, Distance Walked must be
  // >= 1 km. Derived (not stored in `errors`) so it reactively covers both
  // typed input and values populated by simulation restore. When grazing is
  // OFF the field is neutralised (distance 0), so no error applies.
  const distanceError =
    form.grazing && form.distance_walked !== "" && parseFloat(form.distance_walked) < 1
      ? t("Distance walked must be at least 1 km")
      : undefined;

  // Y3 §1.4 — non-lactating categories (Dry Cow / Heifer / Baby Calf)
  // don't produce milk, so Milk Production fields are neither rendered
  // nor required. `showMilkSection` is the single source of truth for
  // both render-gating and required-field checks.
  const showMilkSection = isLactating(form.animal_category);

  // Mirrors Android FeedViewModel.enableButton() exactly, extended for §1.4
  const bw = parseFloat(form.body_weight);
  const bwGain = parseFloat(form.body_weight_gain);
  const bcs = parseFloat(form.body_condition_score);
  const dim = parseInt(form.days_in_milk);
  const dop = parseInt(form.days_of_pregnancy);
  const temp = parseFloat(form.average_temperature);
  const mp = parseFloat(form.milk_production);

  const milkFieldsValid =
    !showMilkSection ||
    (!isNaN(mp) &&
      mp > 0 &&
      mp <= 59 &&
      form.milk_fat_percent !== "" &&
      form.milk_protein_percent !== "");

  const requiredFilled =
    form.simulation_name.trim() !== "" &&
    form.country_id !== "" &&
    form.breed !== "" &&
    !isNaN(bw) &&
    bw >= 350 &&
    bw <= 720 &&
    !isNaN(bwGain) &&
    bwGain <= 1.8 &&
    !isNaN(bcs) &&
    bcs >= 1 &&
    bcs <= 5 &&
    !isNaN(dim) &&
    dim >= 0 &&
    dim <= 400 &&
    !isNaN(dop) &&
    dop >= 0 &&
    dop <= 280 &&
    form.parity !== "" &&
    milkFieldsValid &&
    !isNaN(temp) &&
    temp !== 0 &&
    (!form.grazing || (parseFloat(form.distance_walked) >= 1 && form.topography !== "")) &&
    !hasFieldErrors;

  // Diagnostic — print which gating sub-expression is letting Continue
  // be enabled when the user expects it disabled. Remove after the
  // milk-protein-select-but-button-enabled bug is confirmed fixed.
  if (typeof window !== "undefined") {
    console.log("[cattle-info gating]", {
      requiredFilled,
      animal_category: form.animal_category,
      showMilkSection,
      milkFieldsValid,
      milk_production: form.milk_production,
      milk_protein_percent: form.milk_protein_percent,
      milk_fat_percent: form.milk_fat_percent,
      simulation_name: form.simulation_name,
      breed: form.breed,
      parity: form.parity,
      hasFieldErrors,
    });
  }

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
    setCattleInfo({
      simulation_name: form.simulation_name.trim(),
      country: selectedCountry?.name ?? form.country_name,
      country_id: form.country_id,
      breed: form.breed,
      body_weight: Number(form.body_weight),
      body_weight_gain: form.body_weight_gain ? Number(form.body_weight_gain) : 0,
      body_condition_score: form.body_condition_score ? Number(form.body_condition_score) : 0,
      days_in_milk: Number(form.days_in_milk),
      days_of_pregnancy: Number(form.days_of_pregnancy),
      parity: Number(form.parity),
      milk_production: Number(form.milk_production),
      milk_protein_percent: form.milk_protein_percent ? Number(form.milk_protein_percent) : 0,
      milk_fat_percent: Number(form.milk_fat_percent),
      average_temperature: form.average_temperature ? Number(form.average_temperature) : 25,
      grazing: form.grazing,
      distance: form.grazing && form.distance_walked ? Number(form.distance_walked) : 0,
      topography: form.grazing ? form.topography : "Flat",
      // Y3 §1.3 — null when blank; backend treats null as "no margin card".
      milk_price: form.milk_price ? Number(form.milk_price) : null,
      // Y3 §1.4
      animal_category: form.animal_category,
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
        console.log("[cattle-info save] simulation_language resolution:", {
          "form.simulation_language": form.simulation_language,
          "user.preferred_language": user?.preferred_language,
          languageOptionsForCountry,
          effectiveSimulationLanguage,
          resolved,
        });
        return resolved;
      })(),
    });
    router.push("/feed-selection");
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
    setForm({
      ...EMPTY_FORM,
      country_id: String(user?.country_id ?? ""),
      country_name: user?.country ?? "",
      // EMPTY_FORM.simulation_language is already null; being explicit
      // here so a future edit of EMPTY_FORM can't silently break Reset.
      simulation_language: null,
    });
    setErrors({});
    // Scenario 3 — Reset must clear BOTH screens' data. Beyond the
    // form / feed selections, we also null out cattleInfo in the store
    // so navigating away and back doesn't re-hydrate the previous
    // simulation's values into the form on mount. reportData is nulled
    // too so the forward arrow (which is gated on !!reportData) hides
    // and any stale report is gone.
    setFeedSelections([]);
    setFeedSelectionType("recommendation");
    setCattleInfo(null);
    setReportData(null as never);
    // 500ms is the sweet spot per Nielsen — long enough for the eye to
    // register the transition, short enough that the button doesn't
    // feel unresponsive.
    setTimeout(() => {
      setIsResetting(false);
      showSnackbar(t("Form reset"), "success");
    }, 500);
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar
        type="home"
        title={t("Cattle Info")}
        onMenuOpen={openDrawer}
        showForward={!!reportData}
        onForward={() => router.push("/report")}
      />

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 90 }}>
        {/* Section 1: Simulation Details */}
        <SectionCard
          iconSvg={<IcSimulationDetails size={22} color="#064E3B" />}
          title={t("Simulation Details")}
          topRightContent={
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center justify-center rounded-xl border-none p-0"
              style={{ width: 36, height: 36, backgroundColor: "#E4F7EF", cursor: "pointer" }}
              aria-label={t("Simulation history")}
            >
              {/* Android ic_simulation_history — filled icon, regular weight (no stroke). */}
              <IcSimulationHistory size={20} color="#064E3B" />
            </button>
          }
        >
          <div className="px-3">
            <FieldLabel>{t("Simulation Name *")}</FieldLabel>
            <input
              type="text"
              value={form.simulation_name}
              onChange={(e) => set("simulation_name")(e.target.value)}
              {...loadingFieldProps(
                loadingCountries,
                "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                inputStyle
              )}
            />

            {/* Country/Language shimmer via SelectInput's `loading` prop
                (§ loadingFieldProps comment above) — the SAME dropdown
                markup renders throughout, just non-interactive with
                hidden text while getCountries is in flight, so there's
                no layout drift between loading and loaded. */}
            <FieldLabel>{t("Country *")}</FieldLabel>
            <SelectInput
              value={form.country_id}
              onChange={(v) => {
                const found = countries.find((c) => String(c.id) === v);
                // i18n V2 — snap simulation_language back to null when
                // the newly-picked country doesn't support the currently
                // chosen language (or when we can't verify because the
                // country has no supported_languages field). Keeps us
                // from submitting ?lang= for a code the backend won't
                // translate for this country.
                const supported = [
                  "en",
                  ...(found?.supported_languages ?? []).filter((c) => c !== "en"),
                ];
                setForm((p) => ({
                  ...p,
                  country_id: v,
                  country_name: found?.name ?? "",
                  simulation_language:
                    p.simulation_language && supported.includes(p.simulation_language)
                      ? p.simulation_language
                      : null,
                }));
              }}
              options={countries.map((c) => ({ value: String(c.id), label: c.name }))}
              placeholder={t("Select country")}
              loading={loadingCountries}
            />

            {/* i18n V2 — Per-simulation Language dropdown. English is
                ALWAYS in the list (default when the field is null),
                other options come from the selected country's
                supported_languages. Change here overrides ?lang= for
                every /v1/animal/* call for the duration of this
                simulation only; profile language stays put.

                Needs the countries fetch resolved to know the selected
                country's supported_languages — while loadingCountries,
                render the SAME field shimmered (empty options, loading
                prop) rather than hiding it outright, so it appears in
                the same place at the same time as every other field. */}
            {loadingCountries ? (
              <>
                <FieldLabel>{t("Language")}</FieldLabel>
                <SelectInput
                  value=""
                  onChange={() => {}}
                  options={[]}
                  placeholder={t("Select")}
                  loading
                />
              </>
            ) : (
              countries.length > 0 &&
              (() => {
                return (
                  <>
                    <FieldLabel>{t("Language")}</FieldLabel>
                    <SelectInput
                      value={effectiveSimulationLanguage}
                      onChange={(v) =>
                        setForm((p) => ({
                          ...p,
                          // Store the picked language verbatim — including
                          // "en". Collapsing an explicit English pick to
                          // null used to mean "no override, inherit
                          // profile" — indistinguishable from never having
                          // touched this dropdown. For a user whose PROFILE
                          // language is non-English (e.g. Hindi), explicitly
                          // choosing English for THIS simulation was
                          // silently discarded: on restore (Simulation
                          // History), simulation_language came back empty
                          // and the fallback chain resolved to the
                          // country's primary non-English language instead
                          // of the English the user actually picked. Only
                          // an untouched dropdown (EMPTY_FORM / Reset) is
                          // null now; any explicit choice — English
                          // included — sticks.
                          simulation_language: v,
                        }))
                      }
                      options={(languageOptionsForCountry ?? ["en"]).map((code) => ({
                        value: code,
                        label: labelForLanguage(code),
                      }))}
                      placeholder={t("Select language")}
                    />
                  </>
                );
              })()
            )}

            {/* Y3 §1.4 — Animal Category selector. Sits in Simulation
                Details (top of the form) because the choice gates
                downstream sections (Milk Production hidden for
                non-lactating) and §2.3 report sections. */}
            <FieldLabel>{t("Animal Category *")}</FieldLabel>
            <SelectInput
              value={form.animal_category}
              onChange={(v) => set("animal_category")(v)}
              options={ANIMAL_CATEGORIES.map((c) => ({
                value: c,
                label: ANIMAL_CATEGORY_LABELS[c],
              }))}
              placeholder={t("Select category")}
              loading={loadingCountries}
            />
          </div>
        </SectionCard>

        {/* Section 2: Animal Characteristics */}
        <SectionCard
          iconSvg={<IcAnimalCharacteristics size={22} color="#064E3B" />}
          title={t("Animal Characteristics")}
        >
          <div className="px-3">
            <FieldLabel>{t("Breed Selection *")}</FieldLabel>
            <SelectInput
              value={form.breed}
              onChange={set("breed")}
              options={BREEDS.map((b) => ({ value: b, label: b }))}
              placeholder={t("Select breed")}
              loading={loadingCountries}
            />

            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <FieldLabel>{t("Body Weight (BW; kg) *")}</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.body_weight}
                  onChange={(e) => handleBodyWeight(e.target.value)}
                  {...loadingFieldProps(
                    loadingCountries,
                    "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                    { ...inputStyle, borderColor: errors.body_weight ? "#E44A4A" : undefined }
                  )}
                />
                <FieldError message={errors.body_weight} />
              </div>
              <div>
                <FieldLabel>{t("BW Gain (kg/day) *")}</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.body_weight_gain}
                  onChange={(e) => handleBWGain(e.target.value)}
                  {...loadingFieldProps(
                    loadingCountries,
                    "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                    inputStyle
                  )}
                />
                <FieldError message={errors.body_weight_gain} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <FieldLabel>{t("Body Condition Score *")}</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.body_condition_score}
                  onChange={(e) => handleBCS(e.target.value)}
                  {...loadingFieldProps(
                    loadingCountries,
                    "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                    inputStyle
                  )}
                />
                <FieldError message={errors.body_condition_score} />
              </div>
              <div>
                <FieldLabel>{t("Days in Milk *")}</FieldLabel>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.days_in_milk}
                  onChange={(e) => handleDaysInMilk(e.target.value)}
                  {...loadingFieldProps(
                    loadingCountries,
                    "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                    inputStyle
                  )}
                />
                <FieldError message={errors.days_in_milk} />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 3: Reproductive Data */}
        <SectionCard
          iconSvg={<IcReproductiveData size={22} color="#064E3B" />}
          title={t("Reproductive Data")}
        >
          <div className="px-3">
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <FieldLabel>{t("Days of Pregnancy *")}</FieldLabel>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.days_of_pregnancy}
                  onChange={(e) => handleDaysOfPregnancy(e.target.value)}
                  {...loadingFieldProps(
                    loadingCountries,
                    "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                    inputStyle
                  )}
                />
                <FieldError message={errors.days_of_pregnancy} />
              </div>
              <div>
                <FieldLabel>{t("Parity *")}</FieldLabel>
                <SelectInput
                  value={form.parity}
                  onChange={set("parity")}
                  options={PARITIES.map((p) => ({ value: p, label: p }))}
                  placeholder={t("Select")}
                  loading={loadingCountries}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 4: Milk Production — Y3 §1.4: hidden for non-lactating
            categories so the user isn't prompted for fields that don't
            apply. The form's required-field gating (`milkFieldsValid`)
            skips this section when hidden. */}
        {showMilkSection && (
          <SectionCard
            iconSvg={<IcMilkProduction size={22} color="#064E3B" />}
            title={t("Milk Production")}
          >
            <div className="px-3">
              <FieldLabel>{t("Milk Production (L) *")}</FieldLabel>
              <input
                type="number"
                inputMode="decimal"
                value={form.milk_production}
                onChange={(e) => handleMilkProduction(e.target.value)}
                {...loadingFieldProps(
                  loadingCountries,
                  "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                  inputStyle
                )}
              />
              <FieldError message={errors.milk_production} />

              <div className="grid grid-cols-2 gap-3 mt-1">
                <div>
                  <FieldLabel>{t("Milk Protein % *")}</FieldLabel>
                  <SelectInput
                    value={form.milk_protein_percent}
                    onChange={set("milk_protein_percent")}
                    options={MILK_PROTEIN_OPTIONS.map((v) => ({ value: v, label: v }))}
                    placeholder={t("Select")}
                    loading={loadingCountries}
                  />
                </div>
                <div>
                  <FieldLabel>{t("Milk Fat % *")}</FieldLabel>
                  <SelectInput
                    value={form.milk_fat_percent}
                    onChange={set("milk_fat_percent")}
                    options={MILK_FAT_OPTIONS.map((v) => ({ value: v, label: v }))}
                    placeholder={t("Select")}
                    loading={loadingCountries}
                  />
                </div>
              </div>

              {/* Y3 §1.3 — Milk Price input. Optional. Currency suffix comes
                from the user's selected country. Used by §2.1 margin card.
                Translated as a composed string — the dictionary stores the
                key with a literal "${user.currency}" placeholder (same
                pattern as the "${N} star" / "${count} TOTAL" keys used
                elsewhere), so we translate first and then substitute the
                real currency code into the translated string. */}
              <FieldLabel>
                {t("Milk Price (${user.currency}/L)").replace(
                  "${user.currency}",
                  user?.currency || "currency"
                )}
              </FieldLabel>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={form.milk_price}
                onChange={(e) => set("milk_price")(e.target.value)}
                placeholder={t("Optional")}
                {...loadingFieldProps(
                  loadingCountries,
                  "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                  inputStyle
                )}
              />
            </div>
          </SectionCard>
        )}

        {/* Section 5: Environment */}
        <SectionCard iconSvg={<IcEnvironment size={22} color="#064E3B" />} title={t("Environment")}>
          <div className="px-3">
            <FieldLabel>{t("Avg Temperature (°C) *")}</FieldLabel>
            <input
              type="number"
              inputMode="decimal"
              value={form.average_temperature}
              onChange={(e) => handleAvgTemp(e.target.value)}
              {...loadingFieldProps(
                loadingCountries,
                "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                inputStyle
              )}
            />

            {/* Active Grazing toggle — Android cv_active_grazing marginTop offset_10 (10dp).
                §1.2 Y3: "i" icon next to the label opens a tooltip explaining
                what grazing does to energy requirements. */}
            <div
              className="flex items-center justify-between px-4 py-3 mt-2.5"
              style={{
                backgroundColor: "#F0FDF4",
                border: "1px solid rgba(5,188,109,0.15)",
                borderRadius: 20,
              }}
            >
              <div className="flex items-center gap-2.5">
                <IcActiveGrazing size={22} color="#064E3B" />
                <span
                  className="text-base font-bold"
                  style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
                >
                  {t("Active Grazing")}
                </span>
                <button
                  type="button"
                  onClick={() => setShowGrazingTooltip((p) => !p)}
                  aria-label={t("What does Active Grazing do?")}
                  aria-expanded={showGrazingTooltip}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill={showGrazingTooltip ? "#064E3B" : "#1CA069"}
                    />
                    <circle cx="12" cy="7.6" r="1.35" fill="#FFFFFF" />
                    <rect x="10.95" y="10.5" width="2.1" height="7" rx="1.05" fill="#FFFFFF" />
                  </svg>
                </button>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.grazing}
                  disabled={loadingCountries}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    // Always clear distance_walked when the toggle changes
                    // state — fresh entry expected each time grazing flips,
                    // never carry over a previous value (or default "0").
                    setForm((p) => ({
                      ...p,
                      grazing: checked,
                      distance_walked: "",
                      topography: checked ? p.topography : "Flat",
                    }));
                  }}
                />
                <span className={`toggle-slider${loadingCountries ? " shimmer" : ""}`} />
              </label>
            </div>

            {/* §1.2 Y3 tooltip — appears below the toggle row when "i" is tapped.
                Text is the exact copy from the Refinements Y3 doc. */}
            {showGrazingTooltip && (
              <div
                role="tooltip"
                className="mt-2 px-4 py-3 flex gap-2.5"
                style={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid rgba(5,188,109,0.30)",
                  borderRadius: 16,
                  boxShadow: "0 4px 14px rgba(6,78,59,0.10)",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ flexShrink: 0, marginTop: 2 }}
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" fill="#064E3B" />
                  <circle cx="12" cy="7.6" r="1.35" fill="#FFFFFF" />
                  <rect x="10.95" y="10.5" width="2.1" height="7" rx="1.05" fill="#FFFFFF" />
                </svg>
                <p
                  className="text-sm"
                  style={{
                    color: "#231F20",
                    fontFamily: "Nunito, sans-serif",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {t(
                    "Grazing activity increases energy requirements. If enabled, RationSmart adds an extra energy allowance based on topography and distance walked. Leave this off for housed animals."
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setShowGrazingTooltip(false)}
                  aria-label={t("Close tooltip")}
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    backgroundColor: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: "#6D6D6D",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 3l8 8M11 3L3 11"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            )}

            {/* Distance Walked + Topography — per the Grazing contract these
                are ALWAYS rendered: enabled when grazing is ON, disabled +
                greyed out when OFF. handleContinue still sends the neutral
                distance:0 / topography:"Flat" payload when OFF. */}
            <div style={{ opacity: form.grazing ? 1 : 0.5 }}>
              {/* Topography: label + radios all on one row (matches Android start_toEndOf layout) */}
              <div className="flex items-center gap-5 mt-3 ml-1">
                <span
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                >
                  {(() => {
                    const label = t("Topography *");
                    return label.endsWith(" *") ? label.slice(0, -2) : label;
                  })()}
                  <span style={{ color: "#FC2E20" }}>{" *"}</span>
                </span>
                {(["Flat", "Hilly"] as const).map((opt) => {
                  const selected = form.topography === opt;
                  const active = form.grazing && selected;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={!form.grazing}
                      onClick={() => set("topography")(opt)}
                      className="flex items-center gap-2"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: form.grazing ? "pointer" : "not-allowed",
                        padding: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: `2px solid ${active ? "#064E3B" : "#E2E8F0"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {selected && (
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              backgroundColor: active ? "#064E3B" : "#C2C2C2",
                            }}
                          />
                        )}
                      </div>
                      <span
                        style={{
                          fontFamily: "Nunito, sans-serif",
                          fontSize: 14,
                          fontWeight: active ? 700 : 400,
                          color: active ? "#064E3B" : "#6D6D6D",
                        }}
                      >
                        {t(opt)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <FieldLabel>{t("Distance Walked (km) *")}</FieldLabel>
              <input
                type="number"
                inputMode="decimal"
                value={form.grazing ? form.distance_walked : "0"}
                onChange={(e) => handleDistanceWalked(e.target.value)}
                {...loadingFieldProps(
                  loadingCountries,
                  "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark",
                  form.grazing
                    ? inputStyle
                    : {
                        ...inputStyle,
                        backgroundColor: "#F1F5F9",
                        color: "#999999",
                        cursor: "not-allowed",
                      }
                )}
                // Placed AFTER the spread so it ORs with the loading-disabled
                // state that loadingFieldProps sets (otherwise the spread's
                // own `disabled` would overwrite this one).
                disabled={!form.grazing || loadingCountries}
              />
              <FieldError message={distanceError} />
            </div>
          </div>
        </SectionCard>
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
          maxWidth: "min(100vw, 480px)",
          backgroundColor: "#FFFFFF",
          borderTop: "1px solid #E2E8F0",
          zIndex: 30,
        }}
      >
        <button
          onClick={handleReset}
          disabled={isResetting}
          className="py-3.5 rounded-2xl font-bold text-base inline-flex items-center justify-center gap-2"
          style={{
            border: "2px solid #064E3B",
            color: isResetting ? "#6D6D6D" : "#064E3B",
            background: isResetting ? "#F1F5F9" : "white",
            paddingLeft: isResetting ? 24 : 40,
            paddingRight: isResetting ? 24 : 40,
            fontFamily: "Nunito, sans-serif",
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
                  stroke="#064E3B"
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
            backgroundColor: requiredFilled ? "#064E3B" : "#D3D3D3",
            color: requiredFilled ? "#FFFFFF" : "#999999",
            border: "none",
            fontFamily: "Nunito, sans-serif",
            cursor: requiredFilled ? "pointer" : "not-allowed",
            transition: "background-color 0.2s, color 0.2s",
          }}
        >
          {t("Continue to Feed")}
        </button>
      </div>

      {/* Simulation History Bottom-Sheet Modal */}
      {showHistoryModal && (
        <>
          {/* Backdrop — confined to centered column */}
          <div
            className="fixed top-0 h-full z-50"
            style={{
              left: "max(0px, calc((100vw - 480px) / 2))",
              width: "min(100vw, 480px)",
              backgroundColor: "rgba(0,0,0,0.4)",
            }}
            onClick={() => setShowHistoryModal(false)}
          />
          {/* Sheet */}
          <div
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full rounded-t-3xl bg-white pb-8 overflow-y-auto"
            style={{ maxWidth: "min(100vw, 480px)", maxHeight: "80vh", zIndex: 51 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-4 mb-5">
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#E2E8F0" }} />
            </div>
            {/* Title */}
            <p
              className="text-center font-bold px-3 mb-3"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
            >
              {t("Simulation History")}
            </p>

            {/* Content */}
            <div>
              {isLoadingHistory ? (
                <div className="space-y-3 px-3 pb-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="bg-white p-4 space-y-3"
                      style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
                    >
                      <div
                        className="h-5 w-48 rounded shimmer"
                        style={{ backgroundColor: "#E2E8F0" }}
                      />
                      <div
                        className="h-3.5 w-36 rounded shimmer"
                        style={{ backgroundColor: "#E2E8F0" }}
                      />
                      <div
                        className="h-3.5 w-28 rounded shimmer"
                        style={{ backgroundColor: "#E2E8F0" }}
                      />
                      <div
                        className="h-3.5 w-40 rounded shimmer"
                        style={{ backgroundColor: "#E2E8F0" }}
                      />
                    </div>
                  ))}
                </div>
              ) : historyList.length === 0 ? (
                <p
                  className="text-sm text-center py-8"
                  style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                >
                  {t("No saved simulations found")}
                </p>
              ) : (
                <div className="pb-3">
                  {historyList.map((item, idx) => {
                    const rowId = item.report_id ?? item.simulation_id ?? String(idx);
                    const isRowLoading = loadingSimId === rowId;
                    const displayName = item.simulation_id ?? t("Simulation");
                    const countryName = item.country_name ?? item.country ?? "";
                    const createdAt = item.created_at
                      ? new Date(item.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "";
                    return (
                      <div
                        key={rowId}
                        className="mx-3 mt-3 bg-white"
                        style={{
                          borderRadius: 16,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                          cursor: loadingSimId !== null ? "not-allowed" : "pointer",
                          opacity: loadingSimId !== null && !isRowLoading ? 0.6 : 1,
                        }}
                        onClick={() =>
                          !loadingSimId &&
                          loadSimulation(item.report_id ?? item.simulation_id ?? "")
                        }
                      >
                        <div className="flex items-center" style={{ paddingBottom: 10 }}>
                          {/* Left: text fields */}
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-bold"
                              style={{
                                color: "#231F20",
                                fontFamily: "Nunito, sans-serif",
                                fontSize: 18,
                                margin: "10px 10px 0 10px",
                              }}
                            >
                              {displayName}
                            </p>
                            <div
                              className="flex items-center"
                              style={{ marginTop: 10, marginLeft: 10 }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 14 14"
                                fill="none"
                                style={{ flexShrink: 0, marginRight: 6 }}
                              >
                                <rect
                                  x="2"
                                  y="1.5"
                                  width="10"
                                  height="11"
                                  rx="1.5"
                                  stroke="#6D6D6D"
                                  strokeWidth="1.2"
                                />
                                <path
                                  d="M4 5h6M4 7h5M4 9h3.5"
                                  stroke="#6D6D6D"
                                  strokeWidth="1.2"
                                  strokeLinecap="round"
                                />
                              </svg>
                              <span
                                style={{
                                  color: "#6D6D6D",
                                  fontFamily: "Nunito, sans-serif",
                                  fontSize: 13,
                                }}
                              >
                                {t("ID: ")}
                                {rowId}
                              </span>
                            </div>
                            {countryName && (
                              <div
                                className="flex items-center"
                                style={{ marginTop: 10, marginLeft: 10 }}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 14 14"
                                  fill="none"
                                  style={{ flexShrink: 0, marginRight: 6 }}
                                >
                                  <path
                                    d="M7 1.5A3.5 3.5 0 0 0 3.5 5c0 2.625 3.5 7 3.5 7S10.5 7.625 10.5 5A3.5 3.5 0 0 0 7 1.5zm0 4.75A1.25 1.25 0 1 1 7 4a1.25 1.25 0 0 1 0 2.25z"
                                    fill="#6D6D6D"
                                  />
                                </svg>
                                <span
                                  style={{
                                    color: "#6D6D6D",
                                    fontFamily: "Nunito, sans-serif",
                                    fontSize: 13,
                                  }}
                                >
                                  {t("Country: ")}
                                  {countryName}
                                </span>
                              </div>
                            )}
                            {createdAt && (
                              <div
                                className="flex items-center"
                                style={{ marginTop: 10, marginLeft: 10 }}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 14 14"
                                  fill="none"
                                  style={{ flexShrink: 0, marginRight: 6 }}
                                >
                                  <rect
                                    x="1.5"
                                    y="2.5"
                                    width="11"
                                    height="10"
                                    rx="1.5"
                                    stroke="#6D6D6D"
                                    strokeWidth="1.2"
                                  />
                                  <path
                                    d="M4.5 1.5v2M9.5 1.5v2M1.5 5.5h11"
                                    stroke="#6D6D6D"
                                    strokeWidth="1.2"
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <span
                                  style={{
                                    color: "#6D6D6D",
                                    fontFamily: "Nunito, sans-serif",
                                    fontSize: 13,
                                  }}
                                >
                                  {t("Created on: ")}
                                  {createdAt}
                                </span>
                              </div>
                            )}
                          </div>
                          {/* Right: arrow pill card */}
                          <div
                            className="flex items-center justify-center flex-shrink-0"
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 60,
                              backgroundColor: "#E4F7EF",
                              marginRight: 10,
                            }}
                          >
                            {isRowLoading ? (
                              <svg
                                className="animate-spin"
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                              >
                                <circle cx="8" cy="8" r="6" stroke="#E2E8F0" strokeWidth="2" />
                                <path
                                  d="M8 2a6 6 0 0 1 6 6"
                                  stroke="#064E3B"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path
                                  d="M6 4L10 8L6 12"
                                  stroke="#064E3B"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

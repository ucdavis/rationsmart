"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useDrawer } from "@/lib/DrawerContext";
import {
  getCountries,
  getUserReports,
  getSimulationDetails,
  getCattleInfoFields,
  ANIMAL_CATEGORIES,
  ANIMAL_CATEGORY_LABELS,
  labelForLanguage,
} from "@/lib/api";
import type {
  AnimalCategory,
  CattleInfo,
  CattleInfoFieldKey,
  CattleInfoFieldSpec,
  DietLimits,
} from "@/lib/api";
import { useT } from "@/lib/i18n-ui";
import { containsMultipleDecimalPoints, getDecimalPointIndex } from "@/lib/validators";
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

// ─── State-driven field spec (GET /v1/animal/cattle-info-fields) ────────────
// Which inputs render, what they prefill and what they accept all come from
// the backend per physiological state — nothing below hardcodes a default or
// a range. See getCattleInfoFields() in api.ts for the contract.

type FieldSpecs = Partial<Record<CattleInfoFieldKey, CattleInfoFieldSpec>>;

// Wire key (spec `key`) → this form's field name.
const FORM_KEY: Record<CattleInfoFieldKey, keyof FormState> = {
  breed: "breed",
  body_weight: "body_weight",
  bw_gain: "body_weight_gain",
  bc_score: "body_condition_score",
  days_in_milk: "days_in_milk",
  milk_production: "milk_production",
  tp_milk: "milk_protein_percent",
  fat_milk: "milk_fat_percent",
  parity: "parity",
  days_of_pregnancy: "days_of_pregnancy",
  temperature: "average_temperature",
  grazing: "grazing",
  distance: "distance_walked",
  topography: "topography",
  milk_price: "milk_price",
};

// Numeric fields rendered as dropdowns. When the spec carries no `options`
// the list is generated from min..max at this step.
const DROPDOWN_STEP: Partial<Record<CattleInfoFieldKey, number>> = {
  tp_milk: 0.1,
  fat_milk: 0.1,
  parity: 1,
};

// Stored simulations predate the spec's spelling. Mapped silently — it's the
// same breed, not a changed value, so it isn't flagged as an adjustment.
const ENUM_ALIASES: Record<string, string> = { Crossbreed: "Crossbred" };

function toSpecMap(fields: CattleInfoFieldSpec[]): FieldSpecs {
  const map: FieldSpecs = {};
  for (const f of fields) map[f.key] = f;
  return map;
}

function formatStepValue(n: number, step: number): string {
  return step < 1 ? n.toFixed(1) : String(Math.round(n));
}

function optionsFor(spec: CattleInfoFieldSpec | undefined): string[] {
  if (!spec) return [];
  if (spec.options && spec.options.length > 0) return spec.options;
  const step = DROPDOWN_STEP[spec.key];
  if (!step || spec.min == null || spec.max == null) return [];
  const out: string[] = [];
  // Integer ticks avoid float drift (2.6 + 0.1 * 3 = 2.9000000000000004).
  const ticks = Math.round((spec.max - spec.min) / step);
  for (let i = 0; i <= ticks; i++) out.push(formatStepValue(spec.min + i * step, step));
  return out;
}

// Distance's floor rises while grazing is ON (when_grazing_on).
function boundsFor(
  spec: CattleInfoFieldSpec,
  grazing: boolean
): { min: number | null; max: number | null } {
  if (spec.key === "distance" && grazing && spec.when_grazing_on) {
    return { min: spec.when_grazing_on.min, max: spec.max };
  }
  return { min: spec.min, max: spec.max };
}

function defaultAsFormValue(spec: CattleInfoFieldSpec, grazing = false): string | boolean {
  if (spec.type === "boolean") return Boolean(spec.default);
  const d =
    spec.key === "distance" && grazing && spec.when_grazing_on
      ? spec.when_grazing_on.default
      : spec.default;
  if (d === null || d === undefined) return "";
  const step = DROPDOWN_STEP[spec.key];
  if (step && typeof d === "number") return formatStepValue(d, step);
  return String(d);
}

// Every spec field — visible or hidden — takes its default. Used when the
// user picks a physiological state, on Reset, and on a fresh mount.
function applyDefaults(form: FormState, specs: FieldSpecs): FormState {
  const next = { ...form } as Record<keyof FormState, unknown>;
  for (const spec of Object.values(specs)) {
    if (spec) next[FORM_KEY[spec.key]] = defaultAsFormValue(spec);
  }
  return next as unknown as FormState;
}

// Hidden fields are submitted as their default, whatever the form holds.
function withHiddenDefaults(form: FormState, specs: FieldSpecs): FormState {
  const next = { ...form } as Record<keyof FormState, unknown>;
  for (const spec of Object.values(specs)) {
    if (spec && !spec.visible) next[FORM_KEY[spec.key]] = defaultAsFormValue(spec);
  }
  return next as unknown as FormState;
}

type Adjustments = Partial<Record<keyof FormState, string>>;

// Pull restored / persisted values into the current spec: numbers clamped to
// [min, max], dropdown numbers snapped onto an option, off-list enums replaced
// by the default. Returns what changed (form key → the value it replaced) so
// the form can flag it — a silent edit would surprise the user, an unclamped
// one would 422 on a form they never touched.
function clampToSpecs(
  form: FormState,
  specs: FieldSpecs
): { form: FormState; adjusted: Adjustments } {
  const next = { ...form } as Record<keyof FormState, unknown>;
  const adjusted: Adjustments = {};
  for (const spec of Object.values(specs)) {
    if (!spec || !spec.visible || spec.type === "boolean") continue;
    if ((spec.key === "distance" || spec.key === "topography") && !form.grazing) continue;
    const fk = FORM_KEY[spec.key];
    const raw = String(next[fk] ?? "");
    if (raw === "") continue;

    if (spec.type === "enum") {
      const options = spec.options ?? [];
      if (options.includes(raw)) continue;
      const alias = ENUM_ALIASES[raw];
      if (alias && options.includes(alias)) {
        next[fk] = alias;
        continue;
      }
      next[fk] = defaultAsFormValue(spec);
      adjusted[fk] = raw;
      continue;
    }

    const n = parseFloat(raw);
    if (Number.isNaN(n)) continue;
    const { min, max } = boundsFor(spec, form.grazing);
    let v = n;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    const step = DROPDOWN_STEP[spec.key];
    if (step) {
      v = Math.round(v / step) * step;
      const snapped = optionsFor(spec).find((o) => Math.abs(parseFloat(o) - v) < 1e-9);
      next[fk] = snapped ?? formatStepValue(v, step);
    } else if (v !== n) {
      next[fk] = String(v);
    }
    if (Math.abs(v - n) > 1e-9) adjusted[fk] = raw;
  }
  return { form: next as unknown as FormState, adjusted };
}

// Form (strings) → store shape (numbers). The caller passes a form that has
// already had withHiddenDefaults applied, so hidden fields carry the spec
// default. toCattleInfoPayload still zeroes milk fields for non-lactating
// states on the wire — compatible, since the backend range-checks only the
// fields the spec marks visible.
function formToCattleInfo(f: FormState, simulation_language: string | null): CattleInfo {
  const num = (v: string) => (v === "" ? 0 : Number(v));
  return {
    simulation_name: f.simulation_name.trim(),
    country: f.country_name,
    country_id: f.country_id,
    breed: f.breed,
    body_weight: num(f.body_weight),
    body_weight_gain: num(f.body_weight_gain),
    body_condition_score: num(f.body_condition_score),
    days_in_milk: num(f.days_in_milk),
    days_of_pregnancy: num(f.days_of_pregnancy),
    parity: num(f.parity),
    milk_production: num(f.milk_production),
    milk_protein_percent: num(f.milk_protein_percent),
    milk_fat_percent: num(f.milk_fat_percent),
    average_temperature: num(f.average_temperature),
    grazing: f.grazing,
    distance: f.grazing ? num(f.distance_walked) : 0,
    topography: f.grazing ? f.topography : "Flat",
    // Y3 §1.3 — null when blank; backend treats null as "no margin card".
    milk_price: f.milk_price ? Number(f.milk_price) : null,
    animal_category: f.animal_category,
    simulation_language,
  };
}

// "" / null → "" so a blank stored value stays blank rather than "0".
const toFormString = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

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

// Every animal field is blank here on purpose: the values come from the
// state's field spec (applyDefaults) once it loads, and the form shimmers
// until then. Don't put numbers back — they'd drift from the backend table.
const EMPTY_FORM: FormState = {
  simulation_name: "",
  country_id: "",
  country_name: "",
  breed: "",
  body_weight: "",
  body_weight_gain: "",
  body_condition_score: "",
  days_in_milk: "",
  days_of_pregnancy: "",
  parity: "",
  milk_production: "",
  milk_protein_percent: "",
  milk_fat_percent: "",
  average_temperature: "",
  grazing: false,
  distance_walked: "",
  topography: "",
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

// Amber ring + note on a value that was pulled into range on restore.
const ADJUSTED_RING: React.CSSProperties = { boxShadow: "0 0 0 2px #FF9800" };

function AdjustedNote({ from, label }: { from?: string; label: string }) {
  if (from === undefined) return null;
  return (
    <p className="text-xs mt-1 ml-1" style={{ color: "#FF9800", fontFamily: "Nunito, sans-serif" }}>
      {label} {from}
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
  highlight = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  highlight?: boolean;
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
      style={
        loading
          ? undefined
          : { ...inputStyle, opacity: disabled ? 0.55 : 1, ...(highlight ? ADJUSTED_RING : {}) }
      }
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
  useEffect(() => {
    const state = form.animal_category;
    const hydrated = !!cattleInfo;
    loadSpecs(state).then((s) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Wire key is `physiological_state`; prefer it, fall back to the
      // legacy `animal_category` for older/echoed responses.
      const restoredState =
        ((ci?.physiological_state ?? ci?.animal_category) as AnimalCategory | undefined) ??
        form.animal_category;
      // The RESTORED state's spec, not the current form's — the ranges being
      // clamped against are the ones the simulation will be re-run under.
      const restoredSpecs = await loadSpecs(restoredState);
      // Anything the simulation doesn't carry falls back to the restored
      // state's default rather than whatever the previous case left behind.
      const prev: FormState = restoredSpecs
        ? applyDefaults({ ...form, animal_category: restoredState }, restoredSpecs)
        : form;
      const restoredForm: FormState = {
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
        // Y3 §1.3 / §1.4 — restore Y3 fields from simulation when the
        // backend echoes them back on /fetch-simulation-details. Reads that
        // find nothing fall through to prev (unchanged).
        milk_price: ci?.milk_price != null ? String(ci.milk_price) : prev.milk_price,
        animal_category: restoredState,
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
      };
      // FE-4: a stored value the current ranges reject (most often milk
      // protein 2.5 — the old default, now below the 2.6 floor) is pulled
      // into range and flagged, rather than silently edited or left to 422.
      const clamped = restoredSpecs
        ? clampToSpecs(restoredForm, restoredSpecs)
        : { form: restoredForm, adjusted: {} };
      setForm(clamped.form);

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

      // Custom Diet Limits. The backend returns these as `custom_constraints`
      // on the simulation detail, keyed exactly like DietLimits/BaseThresholds.
      // We never read it before, so restoring a simulation silently dropped
      // the limits it was run with. Only finite numbers are taken, so a
      // partial or junk object can't poison the payload in feed-selection's
      // generateReport.
      //
      // All EIGHT keys now, not just the original four — the backend accepts
      // conc_max / ndf_for_min / nel_balance_max / mp_balance_max as well.
      //
      // UNVERIFIED (2026-09-21): the backend converts pct_dm limits from
      // percent to fraction in the request validator, and `custom_constraints`
      // is persisted downstream of that — so a restored `ash_max` may come
      // back as 0.06 rather than 6. We deliberately do NOT rescale on a hunch.
      // A fraction-scale value falls below the accepted minimum, and
      // feed-selection's pre-flight check catches it before submit and tells
      // the user to open Custom Diet Limits and adjust — rather than either
      // guessing at the scale or letting a raw 422 through.
      const constraints = data?.custom_constraints as Record<string, unknown> | null | undefined;
      if (constraints && typeof constraints === "object") {
        const restoredLimits: Partial<DietLimits> = {};
        (
          [
            "ash_max",
            "ee_max",
            "ndf_max",
            "starch_max",
            "conc_max",
            "ndf_for_min",
            "nel_balance_max",
            "mp_balance_max",
          ] as const
        ).forEach((key) => {
          const raw = constraints[key];
          if (raw === null || raw === undefined || raw === "") return;
          const n = Number(raw);
          if (Number.isFinite(n)) restoredLimits[key] = n;
        });
        setDietLimits(restoredLimits);
      } else {
        // No constraints on this simulation — clear any carried over from
        // the previously loaded case rather than leaking them into this one.
        setDietLimits({});
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
        ...formToCattleInfo(
          restoredSpecs ? withHiddenDefaults(clamped.form, restoredSpecs) : clamped.form,
          restoredSimulationLanguage
        ),
        // Deliberately left blank on restore — see the matching comment
        // on restoredForm above.
        simulation_name: "",
        country: matchedCountry?.name ?? countryName ?? "",
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

  // Android input-format rules (FragmentCattleInfo): clip a second decimal
  // point, and optionally reject a leading "." outright. Range checking is
  // NOT done here — it's derived from the spec at render (fieldError), so it
  // also covers values that arrive by restore or a state change.
  const handleDecimal =
    (key: keyof FormState, { rejectLeadingDot = false } = {}) =>
    (input: string) => {
      if (!input) return set(key)("");
      if (rejectLeadingDot && input.startsWith(".")) return;
      if (containsMultipleDecimalPoints(input)) {
        return set(key)(input.slice(0, getDecimalPointIndex(input)));
      }
      set(key)(input);
    };

  const handleBCS = handleDecimal("body_condition_score", { rejectLeadingDot: true });
  const handleBodyWeight = handleDecimal("body_weight");
  const handleBWGain = handleDecimal("body_weight_gain", { rejectLeadingDot: true });
  const handleDaysInMilk = (input: string) => set("days_in_milk")(input);
  const handleDaysOfPregnancy = (input: string) => set("days_of_pregnancy")(input);
  const handleMilkProduction = handleDecimal("milk_production");
  const handleAvgTemp = handleDecimal("average_temperature", { rejectLeadingDot: true });
  // Android distance walked validation — a bare "0" is never a valid entry
  // while the field is editable (grazing ON has a floor of 1 km).
  const handleDistanceWalked = (input: string) => {
    if (input === "0") return;
    handleDecimal("distance_walked", { rejectLeadingDot: true })(input);
  };

  // While the spec is loading every field is treated as visible, so the
  // shimmer keeps the full layout rather than collapsing and re-expanding.
  const isVisible = (key: CattleInfoFieldKey) => specs?.[key]?.visible ?? true;
  const fieldsLoading = loadingCountries || !specs;

  // Range message for one visible numeric field, or undefined. Blank is not
  // an error here (it just keeps Continue disabled).
  const fieldError = (key: CattleInfoFieldKey): string | undefined => {
    const spec = specs?.[key];
    if (!spec || !spec.visible || spec.type !== "number") return undefined;
    if (key === "distance" && !form.grazing) return undefined;
    const raw = String(form[FORM_KEY[key]] ?? "");
    if (raw === "") return undefined;
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return undefined;
    const { min, max } = boundsFor(spec, form.grazing);
    if ((min == null || n >= min) && (max == null || n <= max)) return undefined;
    // Keeps the existing copy (and its translations) for the grazing floor.
    if (key === "distance" && form.grazing && min != null && n < min) {
      return t("Distance walked must be at least 1 km");
    }
    if (min != null && max != null) return t(`Value Range ${min}-${max}`);
    return min != null ? `≥ ${min}` : `≤ ${max}`;
  };

  // Every visible field must be present and in range; hidden ones are
  // submitted as their default so they don't gate. Distance / topography
  // only count while grazing is ON. Milk price is optional.
  const specFieldsValid =
    !!specs &&
    Object.values(specs).every((spec) => {
      if (!spec || !spec.visible || spec.type === "boolean") return true;
      if ((spec.key === "distance" || spec.key === "topography") && !form.grazing) return true;
      const raw = String(form[FORM_KEY[spec.key]] ?? "");
      if (spec.key === "milk_price" && raw === "") return true;
      if (raw === "") return false;
      if (spec.type === "enum") return !spec.options || spec.options.includes(raw);
      return !Number.isNaN(parseFloat(raw)) && !fieldError(spec.key);
    });

  const requiredFilled =
    form.simulation_name.trim() !== "" && form.country_id !== "" && specFieldsValid;

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
      loadSpecs(resetState).then((s) => {
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
    setReportData(null as never);
    // 500ms is the sweet spot per Nielsen — long enough for the eye to
    // register the transition, short enough that the button doesn't
    // feel unresponsive.
    setTimeout(() => {
      setIsResetting(false);
      showSnackbar(t("Form reset"), "success");
    }, 500);
  };

  const INPUT_CLASS =
    "w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark";

  const anyVisible = (keys: CattleInfoFieldKey[]) => keys.some(isVisible);

  // Two fields side by side; a lone visible one takes the full row.
  const pair = (
    a: [CattleInfoFieldKey, React.ReactNode],
    b: [CattleInfoFieldKey, React.ReactNode]
  ) => {
    const cells = [a, b].filter(([k]) => isVisible(k));
    if (cells.length === 0) return null;
    return (
      <div className="grid grid-cols-2 gap-3 mt-1">
        {cells.map(([k, node]) => (
          <div key={k} className={cells.length === 1 ? "col-span-2" : undefined}>
            {node}
          </div>
        ))}
      </div>
    );
  };

  // The <input> must stay the label's next sibling (tests + FieldLabel layout).
  const specNumberInput = (
    key: CattleInfoFieldKey,
    onChange: (v: string) => void,
    inputMode: "decimal" | "numeric"
  ) => {
    const fk = FORM_KEY[key];
    const wasAdjusted = adjusted[fk] !== undefined;
    return (
      <>
        <input
          type="number"
          inputMode={inputMode}
          value={String(form[fk] ?? "")}
          onChange={(e) => onChange(e.target.value)}
          {...loadingFieldProps(fieldsLoading, INPUT_CLASS, {
            ...inputStyle,
            ...(wasAdjusted ? ADJUSTED_RING : {}),
          })}
        />
        <FieldError message={fieldError(key)} />
        <AdjustedNote from={adjusted[fk]} label={t("Adjusted from")} />
      </>
    );
  };

  // Options are the spec's own (breed) or generated from min..max (milk
  // protein / fat at 0.1, parity at 1).
  const specDropdown = (key: CattleInfoFieldKey, placeholder: string) => {
    const fk = FORM_KEY[key];
    return (
      <>
        <SelectInput
          value={String(form[fk] ?? "")}
          onChange={set(fk)}
          options={optionsFor(specs?.[key]).map((v) => ({ value: v, label: v }))}
          placeholder={placeholder}
          loading={fieldsLoading}
          highlight={adjusted[fk] !== undefined}
        />
        <AdjustedNote from={adjusted[fk]} label={t("Adjusted from")} />
      </>
    );
  };

  // FE-2: grazing ON raises distance to the grazing floor (1 km) instead of
  // leaving a value the backend would 422; OFF drops it back to the base
  // default and resets topography.
  const handleGrazingToggle = (checked: boolean) => {
    const dist = specs?.distance;
    const topo = specs?.topography;
    setForm((p) => {
      let distance = p.distance_walked;
      if (checked) {
        const floor = dist?.when_grazing_on?.default;
        const cur = parseFloat(p.distance_walked);
        if (floor != null && (Number.isNaN(cur) || cur < floor)) distance = String(floor);
      } else {
        distance = dist ? String(defaultAsFormValue(dist)) : "";
      }
      return {
        ...p,
        grazing: checked,
        distance_walked: distance,
        topography: checked
          ? p.topography || (topo ? String(defaultAsFormValue(topo)) : "")
          : topo
            ? String(defaultAsFormValue(topo))
            : p.topography,
      };
    });
    setAdjusted((prev) => {
      const next = { ...prev };
      delete next.distance_walked;
      delete next.topography;
      return next;
    });
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

            {/* Y3 §1.4 — Physiological State selector. Sits in Simulation
                Details (top of the form) because the choice gates
                downstream sections (Milk Production hidden for
                non-lactating) and §2.3 report sections. Stored internally as
                `animal_category`; sent to the backend as `physiological_state`. */}
            <FieldLabel>{t("Physiological State *")}</FieldLabel>
            <SelectInput
              value={form.animal_category}
              onChange={(v) => handleStateChange(v as AnimalCategory)}
              options={ANIMAL_CATEGORIES.map((c) => ({
                value: c,
                label: ANIMAL_CATEGORY_LABELS[c],
              }))}
              placeholder={t("Select category")}
              loading={loadingCountries}
            />
          </div>
        </SectionCard>

        {/* Sections 2–5 are driven by the physiological state's field spec
            (GET /v1/animal/cattle-info-fields): a field renders only when
            the spec marks it visible, and a card drops out entirely when
            none of its fields are (Baby Calf/Heifer keeps only Body
            Weight). Hidden fields are still submitted, as their default. */}

        {/* Section 2: Animal Characteristics */}
        {anyVisible(["breed", "body_weight", "bw_gain", "bc_score", "days_in_milk"]) && (
          <SectionCard
            iconSvg={<IcAnimalCharacteristics size={22} color="#064E3B" />}
            title={t("Animal Characteristics")}
          >
            <div className="px-3">
              {isVisible("breed") && (
                <>
                  <FieldLabel>{t("Breed Selection *")}</FieldLabel>
                  {specDropdown("breed", t("Select breed"))}
                </>
              )}
              {pair(
                [
                  "body_weight",
                  <>
                    <FieldLabel>{t("Body Weight (BW; kg) *")}</FieldLabel>
                    {specNumberInput("body_weight", handleBodyWeight, "decimal")}
                  </>,
                ],
                [
                  "bw_gain",
                  <>
                    <FieldLabel>{t("BW Gain (kg/day) *")}</FieldLabel>
                    {specNumberInput("bw_gain", handleBWGain, "decimal")}
                  </>,
                ]
              )}
              {pair(
                [
                  "bc_score",
                  <>
                    <FieldLabel>{t("Body Condition Score *")}</FieldLabel>
                    {specNumberInput("bc_score", handleBCS, "decimal")}
                  </>,
                ],
                [
                  "days_in_milk",
                  <>
                    <FieldLabel>{t("Days in Milk *")}</FieldLabel>
                    {specNumberInput("days_in_milk", handleDaysInMilk, "numeric")}
                  </>,
                ]
              )}
            </div>
          </SectionCard>
        )}

        {/* Section 3: Reproductive Data */}
        {anyVisible(["days_of_pregnancy", "parity"]) && (
          <SectionCard
            iconSvg={<IcReproductiveData size={22} color="#064E3B" />}
            title={t("Reproductive Data")}
          >
            <div className="px-3">
              {pair(
                [
                  "days_of_pregnancy",
                  <>
                    <FieldLabel>{t("Days of Pregnancy *")}</FieldLabel>
                    {specNumberInput("days_of_pregnancy", handleDaysOfPregnancy, "numeric")}
                  </>,
                ],
                [
                  "parity",
                  <>
                    <FieldLabel>{t("Parity *")}</FieldLabel>
                    {specDropdown("parity", t("Select"))}
                  </>,
                ]
              )}
            </div>
          </SectionCard>
        )}

        {/* Section 4: Milk Production — Lactating Cow only, per the spec. */}
        {anyVisible(["milk_production", "tp_milk", "fat_milk", "milk_price"]) && (
          <SectionCard
            iconSvg={<IcMilkProduction size={22} color="#064E3B" />}
            title={t("Milk Production")}
          >
            <div className="px-3">
              {isVisible("milk_production") && (
                <>
                  <FieldLabel>{t("Milk Production (L) *")}</FieldLabel>
                  {specNumberInput("milk_production", handleMilkProduction, "decimal")}
                </>
              )}
              {pair(
                [
                  "tp_milk",
                  <>
                    <FieldLabel>{t("Milk Protein % *")}</FieldLabel>
                    {specDropdown("tp_milk", t("Select"))}
                  </>,
                ],
                [
                  "fat_milk",
                  <>
                    <FieldLabel>{t("Milk Fat % *")}</FieldLabel>
                    {specDropdown("fat_milk", t("Select"))}
                  </>,
                ]
              )}

              {/* Y3 §1.3 — Milk Price input. Optional. Currency suffix comes
                from the user's selected country. Used by §2.1 margin card.
                Translated as a composed string — the dictionary stores the
                key with a literal "${user.currency}" placeholder (same
                pattern as the "${N} star" / "${count} TOTAL" keys used
                elsewhere), so we translate first and then substitute the
                real currency code into the translated string. */}
              {isVisible("milk_price") && (
                <>
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
                    {...loadingFieldProps(fieldsLoading, INPUT_CLASS, inputStyle)}
                  />
                  <FieldError message={fieldError("milk_price")} />
                </>
              )}
            </div>
          </SectionCard>
        )}

        {/* Section 5: Environment */}
        {anyVisible(["temperature", "grazing", "distance", "topography"]) && (
          <SectionCard
            iconSvg={<IcEnvironment size={22} color="#064E3B" />}
            title={t("Environment")}
          >
            <div className="px-3">
              {isVisible("temperature") && (
                <>
                  <FieldLabel>{t("Avg Temperature (°C) *")}</FieldLabel>
                  {specNumberInput("temperature", handleAvgTemp, "decimal")}
                </>
              )}

              {isVisible("grazing") && (
                <>
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
                          <rect
                            x="10.95"
                            y="10.5"
                            width="2.1"
                            height="7"
                            rx="1.05"
                            fill="#FFFFFF"
                          />
                        </svg>
                      </button>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={form.grazing}
                        disabled={fieldsLoading}
                        onChange={(e) => handleGrazingToggle(e.target.checked)}
                      />
                      <span className={`toggle-slider${fieldsLoading ? " shimmer" : ""}`} />
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
                </>
              )}

              {/* Distance Walked + Topography — per the Grazing contract these
                  are ALWAYS rendered (when the state has them): enabled when
                  grazing is ON, disabled + greyed out when OFF. The OFF
                  payload is the neutral distance:0 / topography:"Flat". */}
              {anyVisible(["distance", "topography"]) && (
                <div style={{ opacity: form.grazing ? 1 : 0.5 }}>
                  {isVisible("topography") && (
                    // Label + radios on one row (Android start_toEndOf layout);
                    // wraps now that the spec offers a third option, Mountainous.
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 ml-1">
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
                      {(specs?.topography?.options ?? []).map((opt) => {
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
                  )}

                  {isVisible("distance") && (
                    <>
                      <FieldLabel>{t("Distance Walked (km) *")}</FieldLabel>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={
                          form.grazing
                            ? form.distance_walked
                            : String(specs?.distance?.default ?? 0)
                        }
                        onChange={(e) => handleDistanceWalked(e.target.value)}
                        {...loadingFieldProps(
                          fieldsLoading,
                          INPUT_CLASS,
                          form.grazing
                            ? {
                                ...inputStyle,
                                ...(adjusted.distance_walked !== undefined ? ADJUSTED_RING : {}),
                              }
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
                        disabled={!form.grazing || fieldsLoading}
                      />
                      <FieldError message={fieldError("distance")} />
                      <AdjustedNote from={adjusted.distance_walked} label={t("Adjusted from")} />
                    </>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        )}
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

"use client";

// Cattle Info — split out of cattle-info/page.tsx (audit B-17).

import type {
  AnimalCategory,
  CattleInfo,
  CattleInfoFieldKey,
  CattleInfoFieldSpec,
} from "@/lib/api";

export type FieldSpecs = Partial<Record<CattleInfoFieldKey, CattleInfoFieldSpec>>;
// Wire key (spec `key`) → this form's field name.
export const FORM_KEY: Record<CattleInfoFieldKey, keyof FormState> = {
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
export function toSpecMap(fields: CattleInfoFieldSpec[]): FieldSpecs {
  const map: FieldSpecs = {};
  for (const f of fields) map[f.key] = f;
  return map;
}
function formatStepValue(n: number, step: number): string {
  return step < 1 ? n.toFixed(1) : String(Math.round(n));
}
export function optionsFor(spec: CattleInfoFieldSpec | undefined): string[] {
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
export function boundsFor(
  spec: CattleInfoFieldSpec,
  grazing: boolean
): { min: number | null; max: number | null } {
  if (spec.key === "distance" && grazing && spec.when_grazing_on) {
    return { min: spec.when_grazing_on.min, max: spec.max };
  }
  return { min: spec.min, max: spec.max };
}
export function defaultAsFormValue(spec: CattleInfoFieldSpec, grazing = false): string | boolean {
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
// Spec-driven writes go through a runtime key (FORM_KEY[spec.key]), which
// TypeScript can't correlate with that field's own type. They're sound:
// every FORM_KEY target is a string field except `grazing`, and
// defaultAsFormValue returns a boolean exactly for boolean specs. So the
// writes happen on a widened view and are narrowed back here — the one
// cast in this module (audit B-23), instead of one per function.
type FormSlots = Record<keyof FormState, FormState[keyof FormState]>;
function patchForm(form: FormState, write: (slots: FormSlots) => void): FormState {
  const next: FormSlots = { ...form };
  write(next);
  return next as FormState;
}
// Every spec field — visible or hidden — takes its default. Used when the
// user picks a physiological state, on Reset, and on a fresh mount.
export function applyDefaults(form: FormState, specs: FieldSpecs): FormState {
  return patchForm(form, (next) => {
    for (const spec of Object.values(specs)) {
      if (spec) next[FORM_KEY[spec.key]] = defaultAsFormValue(spec);
    }
  });
}
// Hidden fields are submitted as their default, whatever the form holds.
export function withHiddenDefaults(form: FormState, specs: FieldSpecs): FormState {
  return patchForm(form, (next) => {
    for (const spec of Object.values(specs)) {
      if (spec && !spec.visible) next[FORM_KEY[spec.key]] = defaultAsFormValue(spec);
    }
  });
}
export type Adjustments = Partial<Record<keyof FormState, string>>;
// Pull restored / persisted values into the current spec: numbers clamped to
// [min, max], dropdown numbers snapped onto an option, off-list enums replaced
// by the default. Returns what changed (form key → the value it replaced) so
// the form can flag it — a silent edit would surprise the user, an unclamped
// one would 422 on a form they never touched.
export function clampToSpecs(
  form: FormState,
  specs: FieldSpecs
): { form: FormState; adjusted: Adjustments } {
  const adjusted: Adjustments = {};
  const clamped = patchForm(form, (next) => {
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
  });
  return { form: clamped, adjusted };
}
// Form (strings) → store shape (numbers). The caller passes a form that has
// already had withHiddenDefaults applied, so hidden fields carry the spec
// default. toCattleInfoPayload still zeroes milk fields for non-lactating
// states on the wire — compatible, since the backend range-checks only the
// fields the spec marks visible.
export function formToCattleInfo(f: FormState, simulation_language: string | null): CattleInfo {
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
export const toFormString = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);
export interface Country {
  id: string | number;
  name: string;
  code?: string;
  country_code?: string;
  currency?: string;
  // i18n V2 — BCP 47 codes the country has translations for. Drives the
  // Language dropdown options on this screen.
  supported_languages?: string[];
}
export interface FormState {
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
export interface HistoryItem {
  simulation_id?: string;
  report_id?: string;
  created_at?: string;
  country_name?: string;
  country?: string;
}
// Every animal field is blank here on purpose: the values come from the
// state's field spec (applyDefaults) once it loads, and the form shimmers
// until then. Don't put numbers back — they'd drift from the backend table.
export const EMPTY_FORM: FormState = {
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

/**
 * Range message for one visible numeric field, or undefined. Blank is not an
 * error here (it only keeps Continue disabled). `t` translates the message.
 */
export function fieldErrorFor(
  key: CattleInfoFieldKey,
  form: FormState,
  specs: FieldSpecs | undefined,
  t: (s: string) => string
): string | undefined {
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
  // Translate the template, then fill it: ranges come from the backend per
  // state, so a pre-filled "Value Range 350-720" key would miss for most.
  if (min != null && max != null) {
    return t("Value Range ${min}-${max}")
      .replace("${min}", String(min))
      .replace("${max}", String(max));
  }
  return min != null ? `≥ ${min}` : `≤ ${max}`;
}

/**
 * Every visible field present and in range. Hidden fields are submitted as
 * their default so they don't gate; distance / topography only count while
 * grazing is ON; milk price is optional.
 */
export function specFieldsValid(
  form: FormState,
  specs: FieldSpecs | undefined,
  t: (s: string) => string
): boolean {
  if (!specs) return false;
  return Object.values(specs).every((spec) => {
    if (!spec || !spec.visible || spec.type === "boolean") return true;
    if ((spec.key === "distance" || spec.key === "topography") && !form.grazing) return true;
    const raw = String(form[FORM_KEY[spec.key]] ?? "");
    if (spec.key === "milk_price" && raw === "") return true;
    if (raw === "") return false;
    if (spec.type === "enum") return !spec.options || spec.options.includes(raw);
    return !Number.isNaN(parseFloat(raw)) && !fieldErrorFor(spec.key, form, specs, t);
  });
}

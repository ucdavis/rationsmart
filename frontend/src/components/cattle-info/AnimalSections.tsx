"use client";

// Cattle Info sections 2–5 (Animal Characteristics, Reproductive Data, Milk
// Production, Environment) — split out of cattle-info/page.tsx (audit B-17).
// Every field is driven by the physiological state's spec: it renders only
// when `visible`, validates against min/max, and a card drops out entirely
// when none of its fields are visible. The page owns the form state.

import { useState, type Dispatch, type SetStateAction } from "react";
import type { CattleInfoFieldKey } from "@/lib/api";
import { containsMultipleDecimalPoints, getDecimalPointIndex } from "@/lib/validators";
import SectionCard from "@/components/SectionCard";
import {
  IcAnimalCharacteristics,
  IcReproductiveData,
  IcMilkProduction,
  IcEnvironment,
  IcActiveGrazing,
} from "@/components/Icons";
import { COLORS } from "@/lib/colors";
import {
  ADJUSTED_RING,
  AdjustedNote,
  FieldError,
  FieldLabel,
  GrazingInfoTooltip,
  SelectInput,
  TopographyRadios,
  inputStyle,
  loadingFieldProps,
} from "./fields";
import {
  type Adjustments,
  type FieldSpecs,
  type FormState,
  FORM_KEY,
  defaultAsFormValue,
  fieldErrorFor,
  optionsFor,
} from "./form-model";

export interface AnimalSectionsProps {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  /** Field setter that also clears the field's "adjusted on restore" flag. */
  set: (key: keyof FormState) => (val: string | boolean) => void;
  specs: FieldSpecs | undefined;
  adjusted: Adjustments;
  setAdjusted: Dispatch<SetStateAction<Adjustments>>;
  fieldsLoading: boolean;
  /** Currency code for the Milk Price label. */
  currency: string | undefined;
  t: (source: string) => string;
}

export default function AnimalSections({
  form,
  setForm,
  set,
  specs,
  adjusted,
  setAdjusted,
  fieldsLoading,
  currency,
  t,
}: AnimalSectionsProps) {
  // §1.2 Grazing info tooltip — tap-only (mobile-first). Click toggles.
  const [showGrazingTooltip, setShowGrazingTooltip] = useState(false);

  // While the spec is loading every field is treated as visible, so the
  // shimmer keeps the full layout rather than collapsing and re-expanding.
  const isVisible = (key: CattleInfoFieldKey) => specs?.[key]?.visible ?? true;
  const fieldError = (key: CattleInfoFieldKey) => fieldErrorFor(key, form, specs, t);

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
    inputMode: "decimal" | "numeric",
    /** The FieldLabel text; becomes the input's accessible name (audit B-31). */
    label?: string
  ) => {
    const fk = FORM_KEY[key];
    const wasAdjusted = adjusted[fk] !== undefined;
    return (
      <>
        <input
          id={`ci-${key}`}
          aria-label={label?.replace(/ \*$/, "")}
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
        <AdjustedNote from={adjusted[fk]} template={t("Adjusted from ${value}")} />
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
        <AdjustedNote from={adjusted[fk]} template={t("Adjusted from ${value}")} />
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
    <>
      {/* Sections 2–5 are driven by the physiological state's field spec
            (GET /v1/animal/cattle-info-fields): a field renders only when
            the spec marks it visible, and a card drops out entirely when
            none of its fields are (Baby Calf/Heifer keeps only Body
            Weight). Hidden fields are still submitted, as their default. */}

      {/* Section 2: Animal Characteristics */}
      {anyVisible(["breed", "body_weight", "bw_gain", "bc_score", "days_in_milk"]) && (
        <SectionCard
          iconSvg={<IcAnimalCharacteristics size={22} color={COLORS.darkAquamarineGreen} />}
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
                  <FieldLabel htmlFor="ci-body_weight">{t("Body Weight (BW; kg) *")}</FieldLabel>
                  {specNumberInput(
                    "body_weight",
                    handleBodyWeight,
                    "decimal",
                    t("Body Weight (BW; kg) *")
                  )}
                </>,
              ],
              [
                "bw_gain",
                <>
                  <FieldLabel htmlFor="ci-bw_gain">{t("BW Gain (kg/day) *")}</FieldLabel>
                  {specNumberInput("bw_gain", handleBWGain, "decimal", t("BW Gain (kg/day) *"))}
                </>,
              ]
            )}
            {pair(
              [
                "bc_score",
                <>
                  <FieldLabel htmlFor="ci-bc_score">{t("Body Condition Score *")}</FieldLabel>
                  {specNumberInput("bc_score", handleBCS, "decimal", t("Body Condition Score *"))}
                </>,
              ],
              [
                "days_in_milk",
                <>
                  <FieldLabel htmlFor="ci-days_in_milk">{t("Days in Milk *")}</FieldLabel>
                  {specNumberInput(
                    "days_in_milk",
                    handleDaysInMilk,
                    "numeric",
                    t("Days in Milk *")
                  )}
                </>,
              ]
            )}
          </div>
        </SectionCard>
      )}

      {/* Section 3: Reproductive Data */}
      {anyVisible(["days_of_pregnancy", "parity"]) && (
        <SectionCard
          iconSvg={<IcReproductiveData size={22} color={COLORS.darkAquamarineGreen} />}
          title={t("Reproductive Data")}
        >
          <div className="px-3">
            {pair(
              [
                "days_of_pregnancy",
                <>
                  <FieldLabel htmlFor="ci-days_of_pregnancy">{t("Days of Pregnancy *")}</FieldLabel>
                  {specNumberInput(
                    "days_of_pregnancy",
                    handleDaysOfPregnancy,
                    "numeric",
                    t("Days of Pregnancy *")
                  )}
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
          iconSvg={<IcMilkProduction size={22} color={COLORS.darkAquamarineGreen} />}
          title={t("Milk Production")}
        >
          <div className="px-3">
            {isVisible("milk_production") && (
              <>
                <FieldLabel htmlFor="ci-milk_production">{t("Milk Production (L) *")}</FieldLabel>
                {specNumberInput(
                  "milk_production",
                  handleMilkProduction,
                  "decimal",
                  t("Milk Production (L) *")
                )}
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
                    currency || "currency"
                  )}
                </FieldLabel>
                <input
                  aria-label={t("Milk Price")}
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
          iconSvg={<IcEnvironment size={22} color={COLORS.darkAquamarineGreen} />}
          title={t("Environment")}
        >
          <div className="px-3">
            {isVisible("temperature") && (
              <>
                <FieldLabel htmlFor="ci-temperature">{t("Avg Temperature (°C) *")}</FieldLabel>
                {specNumberInput(
                  "temperature",
                  handleAvgTemp,
                  "decimal",
                  t("Avg Temperature (°C) *")
                )}
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
                    backgroundColor: COLORS.honeydew,
                    border: "1px solid rgba(5,188,109,0.15)",
                    borderRadius: 20,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <IcActiveGrazing size={22} color={COLORS.darkAquamarineGreen} />
                    <span
                      className="text-base font-bold"
                      style={{ color: COLORS.darkAquamarineGreen }}
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
                          fill={
                            showGrazingTooltip ? COLORS.darkAquamarineGreen : COLORS.crayolaGreen
                          }
                        />
                        <circle cx="12" cy="7.6" r="1.35" fill={COLORS.white} />
                        <rect
                          x="10.95"
                          y="10.5"
                          width="2.1"
                          height="7"
                          rx="1.05"
                          fill={COLORS.white}
                        />
                      </svg>
                    </button>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      aria-label={t("Grazing")}
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
                  <GrazingInfoTooltip onClose={() => setShowGrazingTooltip(false)} t={t} />
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
                  <TopographyRadios
                    options={specs?.topography?.options ?? []}
                    value={form.topography}
                    grazing={form.grazing}
                    onPick={(opt) => set("topography")(opt)}
                    t={t}
                  />
                )}

                {isVisible("distance") && (
                  <>
                    <FieldLabel htmlFor="ci-distance">{t("Distance Walked (km) *")}</FieldLabel>
                    <input
                      id="ci-distance"
                      aria-label={t("Distance Walked (km)")}
                      type="number"
                      inputMode="decimal"
                      value={
                        form.grazing ? form.distance_walked : String(specs?.distance?.default ?? 0)
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
                              backgroundColor: COLORS.americanDiamond,
                              color: COLORS.spanishGray,
                              cursor: "not-allowed",
                            }
                      )}
                      // Placed AFTER the spread so it ORs with the loading-disabled
                      // state that loadingFieldProps sets (otherwise the spread's
                      // own `disabled` would overwrite this one).
                      disabled={!form.grazing || fieldsLoading}
                    />
                    <FieldError message={fieldError("distance")} />
                    <AdjustedNote
                      from={adjusted.distance_walked}
                      template={t("Adjusted from ${value}")}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </>
  );
}

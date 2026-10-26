"use client";

// Cattle Info section 1 — Simulation Details: name, country, the
// per-simulation language and the physiological state. Split out of
// cattle-info/page.tsx (audit B-17); the page owns all state.

import type { Dispatch, SetStateAction } from "react";
import { ANIMAL_CATEGORIES, ANIMAL_CATEGORY_LABELS, labelForLanguage } from "@/lib/api";
import type { AnimalCategory } from "@/lib/api";
import SectionCard from "@/components/SectionCard";
import { IcSimulationDetails, IcSimulationHistory } from "@/components/Icons";
import { COLORS } from "@/lib/colors";
import { FieldLabel, SelectInput, inputStyle, loadingFieldProps } from "./fields";
import type { Country, FormState } from "./form-model";

export interface SimulationDetailsSectionProps {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  set: (key: keyof FormState) => (val: string | boolean) => void;
  countries: Country[];
  loadingCountries: boolean;
  /** Languages the selected country offers ("en" first), or null before a country matches. */
  languageOptionsForCountry: string[] | null;
  /** The language actually in effect — what the Language dropdown shows. */
  effectiveSimulationLanguage: string;
  onStateChange: (next: AnimalCategory) => void;
  onOpenHistory: () => void;
  t: (source: string) => string;
}

export default function SimulationDetailsSection({
  form,
  setForm,
  set,
  countries,
  loadingCountries,
  languageOptionsForCountry,
  effectiveSimulationLanguage,
  onStateChange,
  onOpenHistory,
  t,
}: SimulationDetailsSectionProps) {
  return (
    <SectionCard
      iconSvg={<IcSimulationDetails size={22} color={COLORS.darkAquamarineGreen} />}
      title={t("Simulation Details")}
      topRightContent={
        <button
          onClick={onOpenHistory}
          className="flex items-center justify-center rounded-xl border-none p-0"
          style={{
            width: 36,
            height: 36,
            backgroundColor: COLORS.brightGrayNew,
            cursor: "pointer",
          }}
          aria-label={t("Simulation history")}
        >
          {/* Android ic_simulation_history — filled icon, regular weight (no stroke). */}
          <IcSimulationHistory size={20} color={COLORS.darkAquamarineGreen} />
        </button>
      }
    >
      <div className="px-3">
        <FieldLabel htmlFor="ci-simulation_name">{t("Simulation Name *")}</FieldLabel>
        <input
          id="ci-simulation_name"
          aria-label={t("Simulation Name")}
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
          onChange={(v) => onStateChange(v as AnimalCategory)}
          options={ANIMAL_CATEGORIES.map((c) => ({
            value: c,
            label: ANIMAL_CATEGORY_LABELS[c],
          }))}
          placeholder={t("Select category")}
          loading={loadingCountries}
        />
      </div>
    </SectionCard>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useDrawer } from "@/lib/DrawerContext";
import { getCountries, getUserReports, getSimulationDetails } from "@/lib/api";
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
const MILK_PROTEIN_OPTIONS = ["2.5", "2.6", "2.7", "2.8", "2.9", "3.0", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6"];

interface Country {
  id: string | number;
  name: string;
  code?: string;
  country_code?: string;
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
  distance_walked: string;  // km walked; shown when grazing=ON
  topography: string;       // "Flat" or "Hilly"; shown when grazing=ON
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
  milk_protein_percent: "3.0",
  milk_fat_percent: "3.5",
  average_temperature: "25",
  grazing: false,
  distance_walked: "",
  topography: "Flat",
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
  return <p className={cls} style={style}>{children}</p>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      className="text-xs mt-1 ml-1"
      style={{ color: "#E44A4A", fontFamily: "Nunito, sans-serif" }}
    >
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark pr-9 appearance-none"
        style={{ ...inputStyle, color: value ? "#231F20" : "#999999", opacity: disabled ? 0.55 : 1 }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 5L7 9L11 5" stroke="#6D6D6D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export default function CattleInfoPage() {
  const router = useRouter();
  const { openDrawer } = useDrawer();
  const { cattleInfo, setCattleInfo, user, showSnackbar, reportData } = useStore((s) => ({
    cattleInfo: s.cattleInfo,
    setCattleInfo: s.setCattleInfo,
    user: s.user,
    showSnackbar: s.showSnackbar,
    reportData: s.reportData,
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
        body_condition_score: cattleInfo.body_condition_score ? String(cattleInfo.body_condition_score) : "",
        days_in_milk: cattleInfo.days_in_milk !== undefined ? String(cattleInfo.days_in_milk) : "",
        days_of_pregnancy: cattleInfo.days_of_pregnancy !== undefined ? String(cattleInfo.days_of_pregnancy) : "",
        parity: cattleInfo.parity !== undefined ? String(cattleInfo.parity) : "",
        milk_production: cattleInfo.milk_production ? String(cattleInfo.milk_production) : "",
        milk_protein_percent: cattleInfo.milk_protein_percent ? String(cattleInfo.milk_protein_percent) : "",
        milk_fat_percent: cattleInfo.milk_fat_percent ? String(cattleInfo.milk_fat_percent) : "",
        average_temperature: cattleInfo.average_temperature ? String(cattleInfo.average_temperature) : "",
        grazing: cattleInfo.grazing ?? false,
        distance_walked: cattleInfo.distance != null ? String(cattleInfo.distance) : "0",
        topography: cattleInfo.topography ?? "Flat",
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
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loadingSimId, setLoadingSimId] = useState<string | null>(null);

  useEffect(() => {
    getCountries()
      .then((res) => {
        const data = res.data;
        setCountries(Array.isArray(data) ? data : []);
      })
      .catch(() => showSnackbar("Could not load countries", "error"));
  }, [showSnackbar]);

  useEffect(() => {
    if (!showHistoryModal || !user) return;
    setIsLoadingHistory(true);
    getUserReports(user.id)
      .then((res) => {
        const data = res.data;
        // API returns { simulations: [...], success: bool }
        setHistoryList(Array.isArray(data) ? data : data?.simulations ?? []);
      })
      .catch(() => showSnackbar("Could not load history", "error"))
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
      const matchedCountry = countries.find((c) => c.name?.toLowerCase() === countryName.toLowerCase());
      setForm((prev) => ({
        ...prev,
        simulation_name: data?.simulation_id ?? prev.simulation_name,
        country_id: matchedCountry ? String(matchedCountry.id) : prev.country_id,
        country_name: matchedCountry?.name ?? countryName ?? prev.country_name,
        breed: ci?.breed ?? prev.breed,
        body_weight: ci?.body_weight != null ? String(ci.body_weight) : prev.body_weight,
        body_weight_gain: ci?.bw_gain != null ? String(ci.bw_gain) : prev.body_weight_gain,
        body_condition_score: ci?.bc_score != null ? String(ci.bc_score) : prev.body_condition_score,
        days_in_milk: ci?.days_in_milk != null ? String(ci.days_in_milk) : prev.days_in_milk,
        days_of_pregnancy: ci?.days_of_pregnancy != null ? String(ci.days_of_pregnancy) : prev.days_of_pregnancy,
        parity: ci?.parity != null ? String(ci.parity) : prev.parity,
        milk_production: ci?.milk_production != null ? String(ci.milk_production) : prev.milk_production,
        milk_protein_percent: ci?.tp_milk != null ? String(ci.tp_milk) : prev.milk_protein_percent,
        milk_fat_percent: ci?.fat_milk != null ? String(ci.fat_milk) : prev.milk_fat_percent,
        average_temperature: ci?.temperature != null ? String(ci.temperature) : prev.average_temperature,
        grazing: ci?.grazing ?? prev.grazing,
        distance_walked: ci?.distance != null ? String(ci.distance) : prev.distance_walked,
        topography: ci?.topography ?? prev.topography,
      }));
      setErrors({});
      showSnackbar("Simulation loaded successfully", "success");
      setShowHistoryModal(false);
    } catch {
      showSnackbar("Could not load simulation details", "error");
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
    if (!input) { set("body_condition_score")(""); setError("body_condition_score", undefined); return; }
    if (input.startsWith(".")) return; // Android clears if starts with "."
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("body_condition_score")(input.slice(0, idx));
      return;
    }
    const val = parseFloat(input);
    if (!isNaN(val) && !scoreIsInRange(val)) {
      setError("body_condition_score", "Value Range 1-5");
    } else {
      setError("body_condition_score", undefined);
    }
    set("body_condition_score")(input);
  };

  // Android body weight validation
  const handleBodyWeight = (input: string) => {
    if (!input) { set("body_weight")(""); setError("body_weight", undefined); return; }
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("body_weight")(input.slice(0, idx));
      return;
    }
    const val = parseFloat(input);
    if (!isNaN(val) && !bodyWeightIsInRange(val)) {
      setError("body_weight", "Value Range 350-720");
    } else {
      setError("body_weight", undefined);
    }
    set("body_weight")(input);
  };

  // Android body weight gain validation
  const handleBWGain = (input: string) => {
    if (!input) { set("body_weight_gain")(""); setError("body_weight_gain", undefined); return; }
    if (input.startsWith(".")) return;
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("body_weight_gain")(input.slice(0, idx));
      return;
    }
    const val = parseFloat(input);
    if (!isNaN(val) && !bodyWeightGainIsInRange(val)) {
      setError("body_weight_gain", "Value Range 0-1.8");
    } else {
      setError("body_weight_gain", undefined);
    }
    set("body_weight_gain")(input);
  };

  // Android days in milk validation
  const handleDaysInMilk = (input: string) => {
    if (!input) { set("days_in_milk")(""); setError("days_in_milk", undefined); return; }
    const val = parseInt(input);
    if (!isNaN(val) && !daysInMilkIsInRange(val)) {
      setError("days_in_milk", "Value Range 0-400");
    } else {
      setError("days_in_milk", undefined);
    }
    set("days_in_milk")(input);
  };

  // Android days of pregnancy validation
  const handleDaysOfPregnancy = (input: string) => {
    if (!input) { set("days_of_pregnancy")(""); setError("days_of_pregnancy", undefined); return; }
    const val = parseInt(input);
    if (!isNaN(val) && !daysOfPregnancyIsInRange(val)) {
      setError("days_of_pregnancy", "Value Range 0-280");
    } else {
      setError("days_of_pregnancy", undefined);
    }
    set("days_of_pregnancy")(input);
  };

  // Android milk production validation
  const handleMilkProduction = (input: string) => {
    if (!input) { set("milk_production")(""); setError("milk_production", undefined); return; }
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("milk_production")(input.slice(0, idx));
      return;
    }
    const val = parseFloat(input);
    if (!isNaN(val) && !milkProductionIsInRange(val)) {
      setError("milk_production", "Value Range 1-59");
    } else {
      setError("milk_production", undefined);
    }
    set("milk_production")(input);
  };

  // Android avg temperature validation (format only, no range error — but must be non-zero to enable button)
  const handleAvgTemp = (input: string) => {
    if (!input) { set("average_temperature")(""); return; }
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
    if (!input) { set("distance_walked")(""); return; }
    if (input === "0" || input.startsWith(".")) return;
    if (containsMultipleDecimalPoints(input)) {
      const idx = getDecimalPointIndex(input);
      set("distance_walked")(input.slice(0, idx));
      return;
    }
    set("distance_walked")(input);
  };

  const hasFieldErrors = Object.values(errors).some(Boolean);

  // Mirrors Android FeedViewModel.enableButton() exactly
  const bw = parseFloat(form.body_weight);
  const bwGain = parseFloat(form.body_weight_gain);
  const bcs = parseFloat(form.body_condition_score);
  const dim = parseInt(form.days_in_milk);
  const dop = parseInt(form.days_of_pregnancy);
  const temp = parseFloat(form.average_temperature);
  const mp = parseFloat(form.milk_production);

  const requiredFilled =
    form.simulation_name.trim() !== "" &&
    form.country_id !== "" &&
    form.breed !== "" &&
    !isNaN(bw) && bw >= 350 && bw <= 720 &&
    !isNaN(bwGain) && bwGain <= 1.8 &&
    !isNaN(bcs) && bcs >= 1 && bcs <= 5 &&
    !isNaN(dim) && dim >= 0 && dim <= 400 &&
    !isNaN(dop) && dop >= 0 && dop <= 280 &&
    form.parity !== "" &&
    !isNaN(mp) && mp > 0 && mp <= 59 &&
    form.milk_fat_percent !== "" &&
    form.milk_protein_percent !== "" &&
    !isNaN(temp) && temp !== 0 &&
    (!form.grazing || (parseFloat(form.distance_walked) > 0 && form.topography !== "")) &&
    !hasFieldErrors;

  const handleContinue = () => {
    if (!requiredFilled) return;
    const selectedCountry = countries.find((c) => String(c.id) === String(form.country_id));
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
    });
    router.push("/feed-selection");
  };

  const handleReset = () => {
    setForm({
      ...EMPTY_FORM,
      country_id: String(user?.country_id ?? ""),
      country_name: user?.country ?? "",
    });
    setErrors({});
  };

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar type="home" title="Cattle Info" onMenuOpen={openDrawer} showForward={!!reportData} onForward={() => router.push("/report")} />

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 90 }}>
        {/* Section 1: Simulation Details */}
        <SectionCard
          iconSvg={<IcSimulationDetails size={22} color="#064E3B" />}
          title="Simulation Details"
          topRightContent={
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center justify-center rounded-xl border-none p-0"
              style={{ width: 36, height: 36, backgroundColor: "#E4F7EF", cursor: "pointer" }}
              aria-label="Simulation history"
            >
              {/* Android ic_simulation_history — filled icon, regular weight (no stroke). */}
              <IcSimulationHistory size={20} color="#064E3B" />
            </button>
          }
        >
          <div className="px-3">
            <FieldLabel>Simulation Name *</FieldLabel>
            <input
              type="text"
              value={form.simulation_name}
              onChange={(e) => set("simulation_name")(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
              style={inputStyle}
            />

            <FieldLabel>Country *</FieldLabel>
            <SelectInput
              value={form.country_id}
              onChange={(v) => {
                const found = countries.find((c) => String(c.id) === v);
                setForm((p) => ({ ...p, country_id: v, country_name: found?.name ?? "" }));
              }}
              options={countries.map((c) => ({ value: String(c.id), label: c.name }))}
              placeholder="Select country"
            />
          </div>
        </SectionCard>

        {/* Section 2: Animal Characteristics */}
        <SectionCard iconSvg={<IcAnimalCharacteristics size={22} color="#064E3B" />} title="Animal Characteristics">
          <div className="px-3">
            <FieldLabel>Breed Selection *</FieldLabel>
            <SelectInput
              value={form.breed}
              onChange={set("breed")}
              options={BREEDS.map((b) => ({ value: b, label: b }))}
              placeholder="Select breed"
            />

            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <FieldLabel>Body Weight (BW; kg) *</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.body_weight}
                  onChange={(e) => handleBodyWeight(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                  style={{ ...inputStyle, borderColor: errors.body_weight ? "#E44A4A" : undefined }}
                />
                <FieldError message={errors.body_weight} />
              </div>
              <div>
                <FieldLabel>BW Gain (kg/day) *</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.body_weight_gain}
                  onChange={(e) => handleBWGain(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                  style={inputStyle}
                />
                <FieldError message={errors.body_weight_gain} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <FieldLabel>Body Condition Score *</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.body_condition_score}
                  onChange={(e) => handleBCS(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                  style={inputStyle}
                />
                <FieldError message={errors.body_condition_score} />
              </div>
              <div>
                <FieldLabel>Days in Milk *</FieldLabel>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.days_in_milk}
                  onChange={(e) => handleDaysInMilk(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                  style={inputStyle}
                />
                <FieldError message={errors.days_in_milk} />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 3: Reproductive Data */}
        <SectionCard iconSvg={<IcReproductiveData size={22} color="#064E3B" />} title="Reproductive Data">
          <div className="px-3">
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <FieldLabel>Days of Pregnancy *</FieldLabel>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.days_of_pregnancy}
                  onChange={(e) => handleDaysOfPregnancy(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                  style={inputStyle}
                />
                <FieldError message={errors.days_of_pregnancy} />
              </div>
              <div>
                <FieldLabel>Parity *</FieldLabel>
                <SelectInput
                  value={form.parity}
                  onChange={set("parity")}
                  options={PARITIES.map((p) => ({ value: p, label: p }))}
                  placeholder="Select"
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 4: Milk Production */}
        <SectionCard iconSvg={<IcMilkProduction size={22} color="#064E3B" />} title="Milk Production">
          <div className="px-3">
            <FieldLabel>Milk Production (L) *</FieldLabel>
            <input
              type="number"
              inputMode="decimal"
              value={form.milk_production}
              onChange={(e) => handleMilkProduction(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
              style={inputStyle}
            />
            <FieldError message={errors.milk_production} />

            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <FieldLabel>Milk Protein % *</FieldLabel>
                <SelectInput
                  value={form.milk_protein_percent}
                  onChange={set("milk_protein_percent")}
                  options={MILK_PROTEIN_OPTIONS.map((v) => ({ value: v, label: v }))}
                  placeholder="Select"
                />
              </div>
              <div>
                <FieldLabel>Milk Fat % *</FieldLabel>
                <SelectInput
                  value={form.milk_fat_percent}
                  onChange={set("milk_fat_percent")}
                  options={MILK_FAT_OPTIONS.map((v) => ({ value: v, label: v }))}
                  placeholder="Select"
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 5: Environment */}
        <SectionCard iconSvg={<IcEnvironment size={22} color="#064E3B" />} title="Environment">
          <div className="px-3">
            <FieldLabel>Avg Temperature (°C) *</FieldLabel>
            <input
              type="number"
              inputMode="decimal"
              value={form.average_temperature}
              onChange={(e) => handleAvgTemp(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
              style={inputStyle}
            />

            {/* Active Grazing toggle — Android cv_active_grazing marginTop offset_10 (10dp) */}
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
                  Active Grazing
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.grazing}
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
                <span className="toggle-slider" />
              </label>
            </div>

            {/* Distance Walked + Topography — shown only when grazing is ON */}
            {form.grazing && (
              <>
                {/* Topography: label + radios all on one row (matches Android start_toEndOf layout)
                    Android rg_topography marginTop offset_12 (12dp) and no bottom margin
                    — the next field's own mt-3 (offset_12 12dp) handles the spacing. */}
                <div className="flex items-center gap-5 mt-3 ml-1">
                  <span
                    className="text-xs font-bold uppercase tracking-wide"
                    style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
                  >
                    Topography<span style={{ color: "#FC2E20" }}>{" *"}</span>
                  </span>
                  {(["Flat", "Hilly"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => set("topography")(opt)}
                      className="flex items-center gap-2"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: `2px solid ${form.topography === opt ? "#064E3B" : "#E2E8F0"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {form.topography === opt && (
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              backgroundColor: "#064E3B",
                            }}
                          />
                        )}
                      </div>
                      <span
                        style={{
                          fontFamily: "Nunito, sans-serif",
                          fontSize: 14,
                          fontWeight: form.topography === opt ? 700 : 400,
                          color: form.topography === opt ? "#064E3B" : "#6D6D6D",
                        }}
                      >
                        {opt}
                      </span>
                    </button>
                  ))}
                </div>

                <FieldLabel>Distance Walked (km) *</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.distance_walked}
                  onChange={(e) => handleDistanceWalked(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
                  style={inputStyle}
                />
              </>
            )}
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
          className="py-3.5 rounded-2xl font-bold text-base"
          style={{
            border: "2px solid #064E3B",
            color: "#064E3B",
            background: "white",
            paddingLeft: 40,
            paddingRight: 40,
            fontFamily: "Nunito, sans-serif",
            cursor: "pointer",
          }}
        >
          Reset
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
          Continue to Feed
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
              Simulation History
            </p>

            {/* Content */}
            <div>
            {isLoadingHistory ? (
              <div className="space-y-3 px-3 pb-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-white p-4 space-y-3" style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div className="h-5 w-48 rounded shimmer" style={{ backgroundColor: "#E2E8F0" }} />
                    <div className="h-3.5 w-36 rounded shimmer" style={{ backgroundColor: "#E2E8F0" }} />
                    <div className="h-3.5 w-28 rounded shimmer" style={{ backgroundColor: "#E2E8F0" }} />
                    <div className="h-3.5 w-40 rounded shimmer" style={{ backgroundColor: "#E2E8F0" }} />
                  </div>
                ))}
              </div>
            ) : historyList.length === 0 ? (
              <p
                className="text-sm text-center py-8"
                style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
              >
                No saved simulations found
              </p>
            ) : (
              <div className="pb-3">
                {historyList.map((item, idx) => {
                  const rowId = item.report_id ?? item.simulation_id ?? String(idx);
                  const isRowLoading = loadingSimId === rowId;
                  const displayName = item.simulation_id ?? "Simulation";
                  const countryName = item.country_name ?? item.country ?? "";
                  const createdAt = item.created_at
                    ? new Date(item.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
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
                      onClick={() => !loadingSimId && loadSimulation(item.report_id ?? item.simulation_id ?? "")}
                    >
                      <div className="flex items-center" style={{ paddingBottom: 10 }}>
                        {/* Left: text fields */}
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-bold"
                            style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 18, margin: "10px 10px 0 10px" }}
                          >
                            {displayName}
                          </p>
                          <div className="flex items-center" style={{ marginTop: 10, marginLeft: 10 }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginRight: 6 }}>
                              <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="#6D6D6D" strokeWidth="1.2" />
                              <path d="M4 5h6M4 7h5M4 9h3.5" stroke="#6D6D6D" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                            <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 13 }}>
                              ID: {rowId}
                            </span>
                          </div>
                          {countryName && (
                            <div className="flex items-center" style={{ marginTop: 10, marginLeft: 10 }}>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginRight: 6 }}>
                                <path d="M7 1.5A3.5 3.5 0 0 0 3.5 5c0 2.625 3.5 7 3.5 7S10.5 7.625 10.5 5A3.5 3.5 0 0 0 7 1.5zm0 4.75A1.25 1.25 0 1 1 7 4a1.25 1.25 0 0 1 0 2.25z" fill="#6D6D6D" />
                              </svg>
                              <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 13 }}>
                                Country: {countryName}
                              </span>
                            </div>
                          )}
                          {createdAt && (
                            <div className="flex items-center" style={{ marginTop: 10, marginLeft: 10 }}>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginRight: 6 }}>
                                <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="#6D6D6D" strokeWidth="1.2" />
                                <path d="M4.5 1.5v2M9.5 1.5v2M1.5 5.5h11" stroke="#6D6D6D" strokeWidth="1.2" strokeLinecap="round" />
                              </svg>
                              <span style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 13 }}>
                                Created on: {createdAt}
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Right: arrow pill card */}
                        <div
                          className="flex items-center justify-center flex-shrink-0"
                          style={{ width: 34, height: 34, borderRadius: 60, backgroundColor: "#E4F7EF", marginRight: 10 }}
                        >
                          {isRowLoading ? (
                            <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <circle cx="8" cy="8" r="6" stroke="#E2E8F0" strokeWidth="2" />
                              <path d="M8 2a6 6 0 0 1 6 6" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M6 4L10 8L6 12" stroke="#064E3B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

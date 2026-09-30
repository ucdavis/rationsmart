"use client";

// Admin > Country/Language — split out of admin/country-language/page.tsx (audit B-17).

import { type Dispatch, type SetStateAction, useState } from "react";
import {
  createLanguage,
  patchLanguage,
  listAllCountries,
  toggleCountryStatus,
  assignLanguageToCountry,
  unassignLanguageFromCountry,
  labelForLanguage,
} from "@/lib/api";
import { useEscapeKey } from "@/lib/use-escape";
import { COLORS } from "@/lib/colors";
import {
  CountryRow,
  InactiveCountryRow,
  SkeletonPickerRow,
  SystemLanguage,
  cardStyle,
  inputStyle,
  sheetOverlayStyle,
} from "./shared";
import { useT } from "@/lib/i18n-ui";
import { listFrom } from "@/lib/api-client/normalize";

export function CountriesLanguagesTab({
  countries,
  allLanguages,
  setCountries,
  setAllLanguages,
  showSnackbar,
  askConfirm,
}: {
  countries: CountryRow[];
  allLanguages: SystemLanguage[];
  setCountries: Dispatch<SetStateAction<CountryRow[]>>;
  setAllLanguages: Dispatch<SetStateAction<SystemLanguage[]>>;
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
  askConfirm: (
    title: string,
    body: string,
    label: string,
    danger: boolean,
    onConfirm: () => void | Promise<void>
  ) => void;
}) {
  const t = useT();
  const [showActivate, setShowActivate] = useState(false);
  useEscapeKey(!!showActivate, () => setShowActivate(false));
  const [inactiveCountries, setInactiveCountries] = useState<InactiveCountryRow[]>([]);
  const [isLoadingInactive, setIsLoadingInactive] = useState(false);

  const [assocFor, setAssocFor] = useState<CountryRow | null>(null);
  useEscapeKey(!!assocFor, () => setAssocFor(null));
  const [isAssociating, setIsAssociating] = useState(false);

  const [showRegister, setShowRegister] = useState(false);
  useEscapeKey(!!showRegister, () => setShowRegister(false));
  const [regName, setRegName] = useState("");
  const [regCode, setRegCode] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const [pendingKey, setPendingKey] = useState<Set<string>>(new Set());

  const openActivateSheet = () => {
    setShowActivate(true);
    setIsLoadingInactive(true);
    listAllCountries()
      .then((res) => {
        const all = listFrom<InactiveCountryRow>(res.data, "countries");
        setInactiveCountries(all.filter((c) => !c.is_active));
      })
      .catch(() => showSnackbar(t("Could not load countries"), "error"))
      .finally(() => setIsLoadingInactive(false));
  };

  const handleActivateCountry = async (c: InactiveCountryRow) => {
    try {
      await toggleCountryStatus(c.id, "enable");
      showSnackbar(`${c.name} activated`, "success");
      setShowActivate(false);
      // Optimistic: a freshly-activated country appears with no local
      // languages yet. Re-reading immediately can return stale data
      // (HTTP cache / read-replica lag), so update local state directly.
      setCountries((prev) =>
        prev.some((x) => x.id === c.id)
          ? prev
          : [
              ...prev,
              {
                id: c.id,
                name: c.name,
                country_code: c.country_code,
                is_active: true,
                languages: [],
              },
            ].sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not activate country";
      showSnackbar(msg, "error");
    }
  };

  const handleDeactivateCountry = (c: CountryRow) => {
    const key = `country:${c.id}`;
    if (pendingKey.has(key)) return;
    askConfirm(
      `Deactivate ${c.name}?`,
      `${c.name} will be hidden from registration and profile screens. Existing users, feeds, and reports are unaffected.`,
      "Deactivate",
      true,
      async () => {
        setPendingKey((prev) => new Set(prev).add(key));
        try {
          await toggleCountryStatus(c.id, "disable");
          showSnackbar(`${c.name} deactivated`, "success");
          // Optimistic: drop it from the enabled list immediately.
          setCountries((prev) => prev.filter((x) => x.id !== c.id));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Could not deactivate country";
          showSnackbar(msg, "error");
        } finally {
          setPendingKey((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    );
  };

  const handleDisassociate = (c: CountryRow, code: string) => {
    const key = `${c.id}:${code}`;
    if (pendingKey.has(key)) return;
    const langName = allLanguages.find((l) => l.code === code)?.name ?? code.toUpperCase();
    askConfirm(
      `Dis-associate ${langName} from ${c.name}?`,
      "This Country/Language combination will no longer appear in the Cattle Info screen for farmers.",
      "Dis-associate",
      true,
      async () => {
        setPendingKey((prev) => new Set(prev).add(key));
        try {
          await unassignLanguageFromCountry(c.id, code);
          showSnackbar(`${langName} removed from ${c.name}`, "success");
          // Optimistic: drop the chip from this country immediately.
          setCountries((prev) =>
            prev.map((x) =>
              x.id === c.id ? { ...x, languages: x.languages.filter((g) => g !== code) } : x
            )
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Could not remove language";
          showSnackbar(msg, "error");
        } finally {
          setPendingKey((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    );
  };

  const handleAssociate = async (code: string) => {
    if (!assocFor) return;
    setIsAssociating(true);
    const langName = allLanguages.find((l) => l.code === code)?.name ?? code.toUpperCase();
    try {
      await assignLanguageToCountry(assocFor.id, code);
      showSnackbar(`${langName} associated with ${assocFor.name}`, "success");
      // Optimistic: add the chip to this country immediately.
      setCountries((prev) =>
        prev.map((x) =>
          x.id === assocFor.id && !x.languages.includes(code)
            ? { ...x, languages: [...x.languages, code] }
            : x
        )
      );
      setAssocFor(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not associate language";
      showSnackbar(msg, "error");
    } finally {
      setIsAssociating(false);
    }
  };

  const handleToggleLanguage = (l: SystemLanguage) => {
    const key = `lang:${l.code}`;
    if (pendingKey.has(key)) return;
    const flip = async () => {
      setPendingKey((prev) => new Set(prev).add(key));
      try {
        await patchLanguage(l.code, { is_active: !l.is_active });
        showSnackbar(`${l.name} ${l.is_active ? "deactivated" : "activated"}`, "success");
        // Optimistic: flip the row's active state immediately.
        setAllLanguages((prev) =>
          prev.map((x) => (x.code === l.code ? { ...x, is_active: !l.is_active } : x))
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Could not update language";
        showSnackbar(msg, "error");
      } finally {
        setPendingKey((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    };
    if (l.is_active) {
      askConfirm(
        `Deactivate ${l.name}?`,
        `${l.name} stops resolving for every user in every country. Translations are kept.`,
        "Deactivate",
        true,
        flip
      );
    } else {
      void flip();
    }
  };

  const handleRegister = async () => {
    const code = regCode.trim().toLowerCase();
    if (!regName.trim() || !code) {
      showSnackbar(t("Name and code are required"), "error");
      return;
    }
    setIsRegistering(true);
    const name = regName.trim();
    try {
      await createLanguage({ code, name });
      showSnackbar(`${name} registered`, "success");
      setShowRegister(false);
      setRegName("");
      setRegCode("");
      // Optimistic: add the new language to the catalog immediately.
      setAllLanguages((prev) =>
        prev.some((x) => x.code === code) ? prev : [...prev, { code, name, is_active: true }]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not register language";
      showSnackbar(msg, "error");
    } finally {
      setIsRegistering(false);
    }
  };

  const activeLangCount = allLanguages.filter((l) => l.is_active).length;

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8 space-y-3">
      {/* Enabled Countries / Languages */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{
            backgroundColor: COLORS.brightGrayNew,
            borderBottom: `1px solid ${COLORS.americanDiamond}`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide flex-1"
            style={{ color: COLORS.darkAquamarineGreen }}
          >
            {t("Enabled Countries / Languages")}
          </p>
          <p className="text-xs" style={{ color: COLORS.darkSilver }}>
            {countries.length} {t("enabled")}
          </p>
          <button
            onClick={openActivateSheet}
            aria-label={t("Activate a country")}
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{
              width: 24,
              height: 24,
              backgroundColor: COLORS.darkAquamarineGreen,
              color: COLORS.white,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ＋
          </button>
        </div>
        {countries.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: COLORS.darkSilver }}>
            {t("No countries enabled yet.")}
          </p>
        ) : (
          countries.map((c) => {
            const extraLangs = c.languages.filter((x) => x !== "en");
            const isPending = pendingKey.has(`country:${c.id}`);
            return (
              <div
                key={c.id}
                className="px-4 py-3"
                style={{ borderTop: `1px solid ${COLORS.authenticWhite}` }}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm" style={{ color: COLORS.raisinBlack }}>
                      {c.name}
                    </p>
                    <p className="text-xs" style={{ color: COLORS.darkSilver }}>
                      {extraLangs.length} {t("local language")}
                      {extraLangs.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <label
                    className="toggle-switch flex-shrink-0"
                    aria-label={`Deactivate ${c.name}`}
                    style={{
                      opacity: isPending ? 0.55 : 1,
                      cursor: isPending ? "wait" : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked
                      disabled={isPending}
                      onChange={() => handleDeactivateCountry(c)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {extraLangs.map((code) => {
                    const langName =
                      allLanguages.find((l) => l.code === code)?.name ?? code.toUpperCase();
                    const key = `${c.id}:${code}`;
                    return (
                      <span
                        key={code}
                        className="flex items-center gap-1.5 text-xs font-bold pl-2.5 pr-1 py-1 rounded-full"
                        style={{
                          backgroundColor: COLORS.americanDiamond,
                          color: COLORS.darkAquamarineGreen,
                        }}
                      >
                        {langName}
                        <button
                          onClick={() => handleDisassociate(c, code)}
                          disabled={pendingKey.has(key)}
                          aria-label={`Dis-associate ${langName} from ${c.name}`}
                          className="flex items-center justify-center rounded-full"
                          style={{
                            width: 16,
                            height: 16,
                            background: "rgba(6,78,59,0.13)",
                            border: "none",
                            cursor: pendingKey.has(key) ? "wait" : "pointer",
                            fontSize: 9,
                            color: COLORS.darkAquamarineGreen,
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                  <button
                    onClick={() => setAssocFor(c)}
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: "transparent",
                      color: COLORS.darkAquamarineGreen,
                      border: "1.5px dashed rgba(5,188,109,0.5)",
                      cursor: "pointer",
                    }}
                  >
                    {t("+ Add language")}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Registered Languages */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{
            backgroundColor: COLORS.brightGrayNew,
            borderBottom: `1px solid ${COLORS.americanDiamond}`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide flex-1"
            style={{ color: COLORS.darkAquamarineGreen }}
          >
            {t("Registered Languages")}
          </p>
          <p className="text-xs" style={{ color: COLORS.darkSilver }}>
            {activeLangCount} {t("active")}
          </p>
          <button
            onClick={() => setShowRegister(true)}
            aria-label={t("Register a new language")}
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{
              width: 24,
              height: 24,
              backgroundColor: COLORS.darkAquamarineGreen,
              color: COLORS.white,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ＋
          </button>
        </div>
        {allLanguages.map((l) => {
          const isEnglish = l.code === "en";
          const key = `lang:${l.code}`;
          const isPending = pendingKey.has(key);
          return (
            <div
              key={l.code}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderTop: `1px solid ${COLORS.authenticWhite}`,
                opacity: l.is_active ? 1 : 0.6,
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm" style={{ color: COLORS.raisinBlack }}>
                  {labelForLanguage(l.code)}
                </p>
                <p className="text-xs" style={{ color: COLORS.darkSilver }}>
                  {l.name} · {l.code}
                  {!l.is_active && " · inactive"}
                </p>
              </div>
              {isEnglish ? (
                <span
                  className="text-xs font-bold px-2 py-1 rounded flex-shrink-0"
                  style={{
                    backgroundColor: COLORS.brightGrayNew,
                    color: COLORS.darkAquamarineGreen,
                  }}
                >
                  {t("locked 🔒")}
                </span>
              ) : (
                <label
                  className="toggle-switch flex-shrink-0"
                  aria-label={`${l.is_active ? "Deactivate" : "Activate"} ${l.name}`}
                  style={{ opacity: isPending ? 0.55 : 1, cursor: isPending ? "wait" : "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={l.is_active}
                    disabled={isPending}
                    onChange={() => handleToggleLanguage(l)}
                  />
                  <span className="toggle-slider" />
                </label>
              )}
            </div>
          );
        })}
      </div>

      {/* Activate-a-country sheet */}
      {showActivate && (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={sheetOverlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowActivate(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-t-2xl px-5 pt-5 pb-8"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          >
            <div className="flex justify-center mb-3">
              <div
                style={{
                  width: 40,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: COLORS.goGreen15,
                }}
              />
            </div>
            <h3
              className="text-center font-bold mb-1"
              style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}
            >
              {t("Activate a country")}
            </h3>
            <p className="text-center text-sm mb-5" style={{ color: COLORS.darkSilver }}>
              {t("RationSmart becomes available to farmers in the activated country.")}
            </p>
            {isLoadingInactive ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <SkeletonPickerRow key={i} />
                ))}
              </div>
            ) : inactiveCountries.length === 0 ? (
              <p className="text-sm text-center" style={{ color: COLORS.darkSilver }}>
                {t("All registered countries are already enabled.")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {inactiveCountries.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleActivateCountry(c)}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
                    style={{
                      border: `1px solid ${COLORS.gainsboro}`,
                      background: COLORS.white,
                      cursor: "pointer",
                    }}
                  >
                    <span className="font-bold text-sm" style={{ color: COLORS.raisinBlack }}>
                      {c.name}
                    </span>
                    <span
                      className="text-xs font-bold"
                      style={{ color: COLORS.darkAquamarineGreen }}
                    >
                      {t("Activate →")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Associate-a-language sheet (per country) */}
      {assocFor &&
        (() => {
          const available = allLanguages.filter(
            (l) => l.is_active && !assocFor.languages.includes(l.code)
          );
          return (
            <div
              className="fixed top-0 h-full z-50 flex flex-col justify-end"
              style={sheetOverlayStyle}
              onClick={(e) => {
                if (e.target === e.currentTarget) setAssocFor(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="bg-white rounded-t-2xl px-5 pt-5 pb-8"
                style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
              >
                <div className="flex justify-center mb-3">
                  <div
                    style={{
                      width: 40,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: COLORS.goGreen15,
                    }}
                  />
                </div>
                <h3
                  className="text-center font-bold mb-1"
                  style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}
                >
                  {t("Associate a language —")} {assocFor.name}
                </h3>
                <p className="text-center text-sm mb-5" style={{ color: COLORS.darkSilver }}>
                  {t("The combination will appear in the Cattle Info screen for farmers in")}{" "}
                  {assocFor.name}.
                </p>
                {available.length === 0 ? (
                  <p className="text-sm text-center" style={{ color: COLORS.darkSilver }}>
                    {t(
                      "All active languages are already associated. Register or activate a language first."
                    )}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {available.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => handleAssociate(l.code)}
                        disabled={isAssociating}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
                        style={{
                          border: `1px solid ${COLORS.gainsboro}`,
                          background: COLORS.white,
                          cursor: isAssociating ? "wait" : "pointer",
                        }}
                      >
                        <span className="font-bold text-sm" style={{ color: COLORS.raisinBlack }}>
                          {labelForLanguage(l.code)}{" "}
                          <span style={{ color: COLORS.darkSilver, fontWeight: 400 }}>
                            · {l.name}
                          </span>
                        </span>
                        <span
                          className="text-xs font-bold"
                          style={{ color: COLORS.darkAquamarineGreen }}
                        >
                          {t("Associate →")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Register-a-language sheet — Name + Code only (see file-header note:
          the prototype's "Native name" field has nowhere to persist to on
          the real API, so it's not collected here). */}
      {showRegister && (
        <div
          className="fixed top-0 h-full z-50 flex flex-col justify-end"
          style={sheetOverlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowRegister(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-t-2xl px-5 pt-5 pb-8"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          >
            <div className="flex justify-center mb-3">
              <div
                style={{
                  width: 40,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: COLORS.goGreen15,
                }}
              />
            </div>
            <h3
              className="text-center font-bold mb-4"
              style={{ color: COLORS.darkAquamarineGreen, fontSize: 18 }}
            >
              {t("Register a new language")}
            </h3>
            <p
              className="text-xs font-bold uppercase tracking-wide mb-1"
              style={{ color: COLORS.darkSilver }}
            >
              {t("Language name (English)")}
            </p>
            <input
              aria-label={t("Language name (English)")}
              type="text"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder={t("e.g. Swahili")}
              maxLength={100}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-3"
              style={inputStyle}
            />
            <p
              className="text-xs font-bold uppercase tracking-wide mb-1"
              style={{ color: COLORS.darkSilver }}
            >
              {t("ISO code")}
            </p>
            <input
              aria-label={t("ISO code")}
              type="text"
              value={regCode}
              onChange={(e) => setRegCode(e.target.value.toLowerCase())}
              placeholder={t("e.g. sw")}
              maxLength={10}
              className="w-full rounded-xl px-4 py-3 text-base border-none focus:outline-none mb-5"
              style={inputStyle}
            />
            <button
              onClick={handleRegister}
              disabled={isRegistering}
              className="w-full py-3 rounded-xl font-bold"
              style={{
                backgroundColor: isRegistering ? COLORS.lightGrayNew : COLORS.darkAquamarineGreen,
                color: COLORS.white,
                border: "none",
                cursor: isRegistering ? "not-allowed" : "pointer",
              }}
            >
              {isRegistering ? "Registering…" : "Register language"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SCREEN 2 — Local Feed Names
// ══════════════════════════════════════════════════════════════════════

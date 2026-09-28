"use client";

// Translation coverage (i18n V2 §3.3) for the country + language picked on
// the Feed Names tab: how many feeds / types / categories have a
// translation. Moved here from the retired /admin/translations screen so all
// feed-name translation work is on one screen (audit B-18).
import { useEffect, useState } from "react";
import { getTranslationCoverage } from "@/lib/api";
import { COLORS } from "@/lib/colors";
import { cardStyle } from "./shared";

interface CoverageReport {
  total_feeds?: number;
  translated_feeds?: number;
  missing_feeds?: number;
  total_types?: number;
  translated_types?: number;
  total_categories?: number;
  translated_categories?: number;
}

const pct = (translated?: number, total?: number) =>
  !total ? 0 : Math.round(((translated ?? 0) / total) * 100);
const bandColor = (p: number) =>
  p >= 80 ? COLORS.crayolaGreen : p >= 40 ? COLORS.vividGamboge : COLORS.carminePink;

export default function TranslationCoverageCard({
  countryId,
  lang,
  showSnackbar,
}: {
  countryId: string | null;
  lang: string | null;
  showSnackbar: (message: string, type?: "success" | "error" | "info") => void;
}) {
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // A result only describes the pair it was fetched for.
  useEffect(() => setCoverage(null), [countryId, lang]);

  const load = async () => {
    if (!countryId || !lang) return;
    setIsLoading(true);
    try {
      const res = await getTranslationCoverage(countryId, lang);
      setCoverage(res.data as CoverageReport);
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : "Could not load coverage", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const disabled = isLoading || !countryId || !lang;
  const rows = coverage
    ? [
        {
          label: "Feeds",
          translated: coverage.translated_feeds,
          total: coverage.total_feeds,
          missing: coverage.missing_feeds,
        },
        { label: "Feed Types", translated: coverage.translated_types, total: coverage.total_types },
        {
          label: "Categories",
          translated: coverage.translated_categories,
          total: coverage.total_categories,
        },
      ]
    : [];

  return (
    <div className="bg-white rounded-2xl px-4 py-4" style={cardStyle}>
      <p className="font-bold mb-1" style={{ color: COLORS.darkAquamarineGreen, fontSize: 15 }}>
        Translation coverage
      </p>
      <p className="text-xs mb-3" style={{ color: COLORS.darkSilver, lineHeight: 1.5 }}>
        How complete the feed, type and category translations are for the selected language.
      </p>
      <button
        onClick={() => void load()}
        disabled={disabled}
        className="w-full py-3 rounded-xl font-bold"
        style={{
          backgroundColor: disabled ? COLORS.lightGrayNew : COLORS.darkAquamarineGreen,
          color: COLORS.white,
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {isLoading ? "Loading…" : "Check Coverage"}
      </button>
      {rows.length > 0 && (
        <div className="mt-3 space-y-3">
          {rows.map(({ label, translated, total, missing }) => {
            const p = pct(translated, total);
            return (
              <div key={label}>
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-sm font-bold" style={{ color: COLORS.raisinBlack }}>
                    {label}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.darkSilver }}>
                    {translated ?? 0} / {total ?? 0}
                    {missing != null && missing > 0 && ` · ${missing} missing`}
                  </p>
                </div>
                <div
                  className="w-full rounded-full overflow-hidden"
                  role="progressbar"
                  aria-label={`${label} translated`}
                  aria-valuenow={p}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{ height: 8, backgroundColor: COLORS.americanDiamond }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${p}%`,
                      backgroundColor: bandColor(p),
                      transition: "width 0.25s",
                    }}
                  />
                </div>
                <p
                  className="text-xs mt-0.5 text-right"
                  style={{ color: bandColor(p), fontWeight: 700 }}
                >
                  {p}%
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

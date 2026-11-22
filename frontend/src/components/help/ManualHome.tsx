"use client";

// N11 Help home / N19 Admin Manual list: search, the Quick start (hero) card
// and every topic. The source decides the data and every link (manual-source.ts).
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Toolbar from "@/components/Toolbar";
import Spinner from "@/components/ui/Spinner";
import {
  Chip,
  HELP_OFFLINE,
  HELP_UNAVAILABLE,
  HelpNote,
  NOT_IN_LANGUAGE,
  SectionTitle,
  TopicRow,
  VideoPill,
  helpCard,
} from "@/components/help/HelpParts";
import { useManualIndex } from "@/components/help/useHelpIndex";
import { useOpenGuide } from "@/components/help/useOpenGuide";
import type { ManualSource } from "@/components/help/manual-source";
import { COLORS } from "@/lib/colors";
import { useT } from "@/lib/i18n-ui";

export default function ManualHome({ source }: { source: ManualSource }) {
  const router = useRouter();
  const t = useT(source.lang);
  const { index, error, retry } = useManualIndex(source.getIndex);
  const { opening, error: guideError, openGuide } = useOpenGuide<"guide">();
  const { guide } = source;
  const [query, setQuery] = useState("");
  // A topic that failed to load sends the user here with its message.
  const notice = useSearchParams().get("notice");
  const shownNotice = notice === HELP_OFFLINE || notice === HELP_UNAVAILABLE ? notice : null;

  const open = (key: string) => router.push(source.topicHref(key));
  const needle = query.trim().toLowerCase();
  const quickStart = index?.topics.find((topic) => topic.key === index.quick_start);
  const topics = (index?.topics ?? []).filter((topic) =>
    needle
      ? `${topic.title} ${topic.summary}`.toLowerCase().includes(needle)
      : topic.key !== index?.quick_start
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t(source.title)} onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-8">
        {error && (
          <>
            <HelpNote text={t(error)} tone="error" />
            <Chip label={t("Try again")} onClick={retry} />
          </>
        )}
        {!error && shownNotice && <HelpNote text={t(shownNotice)} tone="error" />}
        {guideError && <HelpNote text={t(guideError)} tone="error" />}

        {!index && !error && (
          <div className="flex justify-center py-10" style={{ color: COLORS.darkAquamarineGreen }}>
            <Spinner size={28} />
          </div>
        )}

        {index && (
          <>
            {source.showFallbackNote && index.fallback && <HelpNote text={t(NOT_IN_LANGUAGE)} />}

            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search help…")}
              aria-label={t("Search help…")}
              className="w-full mb-4 outline-none"
              style={{
                padding: "12px 16px",
                borderRadius: 16,
                border: "none",
                backgroundColor: COLORS.americanDiamond,
                color: COLORS.raisinBlack,
                fontSize: 16,
              }}
            />

            {!needle && quickStart && (
              <button
                type="button"
                onClick={() => open(quickStart.key)}
                className="w-full text-left mb-2"
                style={{
                  ...helpCard,
                  border: "none",
                  cursor: "pointer",
                  padding: 16,
                  backgroundColor: COLORS.darkAquamarineGreen,
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-bold uppercase"
                    style={{ color: COLORS.mintWhisper }}
                  >
                    {t("Quick start")}
                  </span>
                  <VideoPill seconds={quickStart.video_seconds} onDark />
                </span>
                <span
                  className="block font-bold mt-1"
                  style={{ color: COLORS.white, fontSize: 17 }}
                >
                  {quickStart.title}
                </span>
                <span className="block text-sm mt-1" style={{ color: COLORS.white }}>
                  {quickStart.summary}
                </span>
              </button>
            )}

            <SectionTitle>{t("All topics")}</SectionTitle>
            {topics.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: COLORS.darkSilver }}>
                {t("No help topics match your search.")}
              </p>
            ) : (
              <div style={{ ...helpCard, overflow: "hidden" }}>
                {topics.map((topic, i) => (
                  <div key={topic.key}>
                    {i > 0 && <div style={{ height: 1, backgroundColor: COLORS.webDivider }} />}
                    <TopicRow topic={topic} onOpen={() => open(topic.key)} />
                  </div>
                ))}
              </div>
            )}

            {/* N20: the printable guide (Admin Manual only), opened like N16's. */}
            {guide && (
              <button
                type="button"
                onClick={() => void openGuide("guide", guide.check, guide.href)}
                disabled={opening !== null}
                className="w-full flex items-center justify-between text-left mt-4"
                style={{
                  ...helpCard,
                  border: "none",
                  cursor: "pointer",
                  padding: "12px 16px",
                  color: COLORS.raisinBlack,
                  fontSize: 15,
                }}
              >
                <span className="font-bold">{t(guide.label)}</span>
                {opening ? (
                  <span style={{ color: COLORS.darkAquamarineGreen }}>
                    <Spinner size={18} />
                  </span>
                ) : (
                  <span aria-hidden style={{ color: COLORS.darkSilver }}>
                    ↗
                  </span>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

// N11 Help home (Help › User Manual): search, the Quick start card and every
// topic. Outside (main) so it also works before login.
import { Suspense, useState } from "react";
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
import { useHelpIndex, useHelpLang } from "@/components/help/useHelpIndex";
import { COLORS } from "@/lib/colors";
import { helpTopicHref } from "@/lib/help";
import { useT } from "@/lib/i18n-ui";

function HelpHome() {
  const router = useRouter();
  const lang = useHelpLang();
  const t = useT(lang);
  const { index, error, retry } = useHelpIndex(lang);
  const [query, setQuery] = useState("");
  // A topic that failed to load sends the user here with its message.
  const notice = useSearchParams().get("notice");
  const shownNotice = notice === HELP_OFFLINE || notice === HELP_UNAVAILABLE ? notice : null;

  const open = (key: string) => router.push(helpTopicHref(key, lang));
  const needle = query.trim().toLowerCase();
  const quickStart = index?.topics.find((topic) => topic.key === index.quick_start);
  const topics = (index?.topics ?? []).filter((topic) =>
    needle
      ? `${topic.title} ${topic.summary}`.toLowerCase().includes(needle)
      : topic.key !== index?.quick_start
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("User Manual")} onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-8">
        {error && (
          <>
            <HelpNote text={t(error)} tone="error" />
            <Chip label={t("Try again")} onClick={retry} />
          </>
        )}
        {!error && shownNotice && <HelpNote text={t(shownNotice)} tone="error" />}

        {!index && !error && (
          <div className="flex justify-center py-10" style={{ color: COLORS.darkAquamarineGreen }}>
            <Spinner size={28} />
          </div>
        )}

        {index && (
          <>
            {index.fallback && <HelpNote text={t(NOT_IN_LANGUAGE)} />}

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
                  <VideoPill seconds={quickStart.video_seconds} />
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
          </>
        )}
      </div>
    </div>
  );
}

export default function HelpHomePage() {
  // useSearchParams must be inside Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <HelpHome />
    </Suspense>
  );
}

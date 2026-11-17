"use client";

// N11 topic screen. Opened two ways:
//   ?key=<topic>     — from Help home, a related chip or an FAQ;
//   ?screen=<key>    — from a screen's ❓; the index's `screens` map picks the
//                      topic and its "Also on this screen" list (contract §3).
// An unknown screen key, a failed index or a 404 topic falls back to Help home.
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Toolbar from "@/components/Toolbar";
import Spinner from "@/components/ui/Spinner";
import VideoFacade from "@/components/help/VideoFacade";
import {
  Chip,
  HelpNote,
  NOT_IN_LANGUAGE,
  SectionTitle,
  helpCard,
  helpErrorMessage,
  plainText,
} from "@/components/help/HelpParts";
import { useHelpIndex, useHelpLang } from "@/components/help/useHelpIndex";
import { getHelpTopic, helpMediaUrl, type HelpTopic } from "@/lib/api";
import { COLORS } from "@/lib/colors";
import { errorStatus } from "@/lib/errors";
import { helpHomeHref, helpTopicHref } from "@/lib/help";
import { useT } from "@/lib/i18n-ui";
import { useLatestRef } from "@/lib/use-latest";

function HelpTopicScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const keyParam = params.get("key");
  const screenParam = params.get("screen");
  const lang = useHelpLang();
  const t = useT(lang);
  const { index, error: indexError } = useHelpIndex(lang);
  const screenEntry = screenParam ? index?.screens[screenParam] : undefined;
  const topicKey = keyParam ?? screenEntry?.topic ?? null;

  const [topic, setTopic] = useState<HelpTopic | null>(null);
  const [start, setStart] = useState<number | null>(null);

  // A ❓ whose screen the map doesn't know (or no index at all) → Help home.
  useEffect(() => {
    const unresolved = !keyParam && (!screenParam || indexError || (index && !screenEntry));
    if (unresolved) router.replace(helpHomeHref(lang));
  }, [keyParam, screenParam, index, indexError, screenEntry, lang, router]);

  // Read, not re-run on: the fetch depends only on the topic and language.
  const routerRef = useLatestRef(router);
  useEffect(() => {
    if (!topicKey) return;
    let cancelled = false;
    setTopic(null);
    setStart(null);
    getHelpTopic(topicKey, lang)
      .then((next) => {
        if (!cancelled) setTopic(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 404 → plain Help home; anything else → Help home with the message.
        const notice = errorStatus(err) === 404 ? undefined : helpErrorMessage(err);
        routerRef.current.replace(helpHomeHref(lang, notice));
      });
    return () => {
      cancelled = true;
    };
  }, [topicKey, lang, routerRef]);

  const titleOf = (key: string) => index?.topics.find((s) => s.key === key)?.title;
  // From ❓ the screen's own related list; from the menu the topic's.
  const related = (screenEntry ? screenEntry.related : (topic?.related ?? [])).filter(
    (key) => key !== topic?.key && titleOf(key)
  );
  const nextTitle = topic?.next ? titleOf(topic.next) : undefined;
  const open = (key: string) => router.push(helpTopicHref(key, lang));
  const watchFrom = (seconds: number) => {
    setStart(seconds);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("User Manual")} onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-8">
        {!topic ? (
          <div className="flex justify-center py-10" style={{ color: COLORS.darkAquamarineGreen }}>
            <Spinner size={28} />
          </div>
        ) : (
          <>
            {topic.fallback && <HelpNote text={t(NOT_IN_LANGUAGE)} />}

            {topic.screen_label && (
              <p className="text-xs font-bold uppercase" style={{ color: COLORS.darkSilver }}>
                {t(topic.screen_label)}
              </p>
            )}
            <h2
              className="font-bold mt-1"
              style={{ ...plainText, color: COLORS.darkAquamarineGreen, fontSize: 20 }}
            >
              {topic.title}
            </h2>
            {topic.summary && (
              <p className="text-sm mt-1 mb-4" style={{ ...plainText, color: COLORS.darkSilver }}>
                {topic.summary}
              </p>
            )}

            {topic.video && (
              <VideoFacade
                video={topic.video}
                title={topic.title}
                lang={lang}
                start={start}
                onPlay={setStart}
                t={t}
              />
            )}

            <SectionTitle>{t("Steps")}</SectionTitle>
            <ol className="list-none p-0 m-0">
              {topic.steps.map((step, i) => {
                const image = helpMediaUrl(step.image);
                return (
                  <li key={i} className="mb-3" style={{ ...helpCard, padding: 14 }}>
                    <div className="flex gap-3">
                      <span
                        className="shrink-0 flex items-center justify-center text-sm font-bold"
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: COLORS.darkAquamarineGreen,
                          color: COLORS.white,
                        }}
                      >
                        {i + 1}
                      </span>
                      <p
                        className="flex-1"
                        style={{ ...plainText, color: COLORS.raisinBlack, fontSize: 15 }}
                      >
                        {step.text}
                      </p>
                    </div>
                    {image && (
                      // eslint-disable-next-line @next/next/no-img-element -- backend image via the proxy (images are unoptimized)
                      <img
                        src={image}
                        alt=""
                        loading="lazy"
                        className="mt-3"
                        style={{ width: "100%", height: "auto", borderRadius: 8 }}
                      />
                    )}
                    {topic.video && step.video_start !== null && (
                      <button
                        type="button"
                        onClick={() => watchFrom(step.video_start ?? 0)}
                        className="mt-2 text-sm font-bold"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: COLORS.crayolaGreen,
                        }}
                      >
                        ▶ {t("Watch this step")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>

            {topic.problems.length > 0 && (
              <div
                className="mt-4 p-4"
                style={{ borderRadius: 12, backgroundColor: COLORS.vividGamboge15 }}
              >
                <h2 className="font-bold mb-2" style={{ color: COLORS.fireOrange, fontSize: 16 }}>
                  {t("Common problems")}
                </h2>
                {topic.problems.map((problem, i) => (
                  <div key={i} className={i > 0 ? "mt-3" : undefined}>
                    <p
                      className="font-bold text-sm"
                      style={{ ...plainText, color: COLORS.raisinBlack }}
                    >
                      {problem.title}
                    </p>
                    <p className="text-sm" style={{ ...plainText, color: COLORS.raisinBlack }}>
                      {problem.text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {related.length > 0 && (
              <>
                <SectionTitle>{t("Also on this screen")}</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {related.map((key) => (
                    <Chip key={key} label={titleOf(key) ?? key} onClick={() => open(key)} />
                  ))}
                </div>
              </>
            )}

            {topic.next && nextTitle && (
              <>
                <SectionTitle>{t("Next topic")}</SectionTitle>
                <Chip label={`${nextTitle} →`} onClick={() => open(topic.next ?? "")} />
              </>
            )}
            <div className="mt-6">
              <Chip label={t("All topics")} onClick={() => router.push(helpHomeHref(lang))} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function HelpTopicPage() {
  // useSearchParams must be inside Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <HelpTopicScreen />
    </Suspense>
  );
}

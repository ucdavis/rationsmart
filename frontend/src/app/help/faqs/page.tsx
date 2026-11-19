"use client";

// N11 FAQ list (Help › FAQs). An answer that names a topic links to it.
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import Toolbar from "@/components/Toolbar";
import Spinner from "@/components/ui/Spinner";
import { Chip, HelpNote, NOT_IN_LANGUAGE, helpCard, plainText } from "@/components/help/HelpParts";
import { useHelpIndex, useHelpLang } from "@/components/help/useHelpIndex";
import { COLORS } from "@/lib/colors";
import { helpTopicHref } from "@/lib/help";
import { useT } from "@/lib/i18n-ui";

function HelpFaqs() {
  const router = useRouter();
  const lang = useHelpLang();
  const t = useT(lang);
  const { index, error, retry } = useHelpIndex(lang);
  const titleOf = (key: string) => index?.topics.find((topic) => topic.key === key)?.title;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("FAQs")} onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-8">
        {error && (
          <>
            <HelpNote text={t(error)} tone="error" />
            <Chip label={t("Try again")} onClick={retry} />
          </>
        )}
        {!index && !error && (
          <div className="flex justify-center py-10" style={{ color: COLORS.darkAquamarineGreen }}>
            <Spinner size={28} />
          </div>
        )}
        {index?.fallback && <HelpNote text={t(NOT_IN_LANGUAGE)} />}
        {index?.faqs.map((faq, i) => {
          const topicTitle = faq.topic ? titleOf(faq.topic) : undefined;
          return (
            <div key={i} className="mb-3" style={{ ...helpCard, padding: 16 }}>
              <h2
                className="font-bold"
                style={{ ...plainText, color: COLORS.raisinBlack, fontSize: 15 }}
              >
                {faq.question}
              </h2>
              <p className="text-sm mt-1" style={{ ...plainText, color: COLORS.darkSilver }}>
                {faq.answer}
              </p>
              {faq.topic && topicTitle && (
                <div className="mt-3">
                  <Chip
                    label={`${topicTitle} →`}
                    onClick={() => router.push(helpTopicHref(faq.topic ?? "", lang))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HelpFaqsPage() {
  // useSearchParams must be inside Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <HelpFaqs />
    </Suspense>
  );
}

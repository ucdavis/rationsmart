"use client";

// N19: the User Manual and the Admin Manual share their list and topic
// screens (ManualHome, ManualTopic). A source says where a manual's data
// comes from and where its links go, so an admin never lands under /help.
import { useMemo } from "react";
import {
  getAdminHelpIndex,
  getAdminHelpTopic,
  getHelpIndex,
  getHelpTopic,
  type HelpIndex,
  type HelpTopic,
} from "@/lib/api";
import { adminManualHref, adminManualTopicHref, helpHomeHref, helpTopicHref } from "@/lib/help";
import { useUiLang } from "@/lib/i18n-ui";
import { useHelpLang } from "./useHelpIndex";

export interface ManualSource {
  /** Toolbar title — an English label, shown through t(). */
  title: string;
  /** Language of the screen labels (t()) and of the video's captions. */
  lang: string;
  /** Show "This help is not yet in your language." when the answer fell back. */
  showFallbackNote: boolean;
  getIndex: () => Promise<HelpIndex>;
  getTopic: (key: string) => Promise<HelpTopic>;
  /** The list; `notice` = an English message to show there (via t()). */
  homeHref: (notice?: string) => string;
  topicHref: (key: string) => string;
}

/** The public User Manual, in the profile language. */
export function useUserManualSource(): ManualSource {
  const lang = useHelpLang();
  return useMemo(
    () => ({
      title: "User Manual",
      lang,
      showFallbackNote: true,
      getIndex: () => getHelpIndex(lang),
      getTopic: (key: string) => getHelpTopic(key, lang),
      homeHref: (notice?: string) => helpHomeHref(lang, notice),
      topicHref: (key: string) => helpTopicHref(key, lang),
    }),
    [lang]
  );
}

/** The Admin Manual: English content, labels in the admin's app language, no fallback note. */
export function useAdminManualSource(): ManualSource {
  const lang = useUiLang();
  return useMemo(
    () => ({
      title: "Admin Manual",
      lang,
      showFallbackNote: false,
      getIndex: getAdminHelpIndex,
      getTopic: getAdminHelpTopic,
      homeHref: adminManualHref,
      topicHref: adminManualTopicHref,
    }),
    [lang]
  );
}

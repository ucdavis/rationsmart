// In-app help (N11): screen keys and help-screen links. The backend's
// `screens` map decides which topic a screen's ❓ opens, so the app never
// names a topic for a screen — it only sends the screen key (contract §3).

export type HelpScreenKey =
  | "welcome"
  | "login"
  | "register"
  | "verify-email"
  | "forgot-pin"
  | "set-new-pin"
  | "cattle-info"
  | "calf-plan"
  | "feed-selection"
  | "report.recommendation"
  | "report.evaluation"
  | "report.no-diet"
  | "reports"
  | "profile"
  | "feedback";

/** The Report's screen key: evaluation, a recommendation with no diet, or with one. */
export function reportHelpScreen(
  mode: string | undefined,
  dietRating: string | null | undefined
): HelpScreenKey {
  if (mode === "evaluation") return "report.evaluation";
  if ((dietRating ?? "").toUpperCase() === "INFEASIBLE") return "report.no-diet";
  return "report.recommendation";
}

const withParams = (path: string, params: Record<string, string | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
};

/** Help home (topic list); `notice` = an English message to show there (via t()). */
export const helpHomeHref = (lang?: string, notice?: string) =>
  withParams("/help/manual", { lang, notice });

/** FAQ list. */
export const helpFaqsHref = (lang?: string) => withParams("/help/faqs", { lang });

/** A topic by its key (menu, related chips, FAQ links). */
export const helpTopicHref = (key: string, lang?: string) =>
  withParams("/help/topic", { key, lang });

/** The topic a screen's ❓ opens — resolved on the topic screen from the index. */
export const helpScreenHref = (screen: HelpScreenKey, lang?: string) =>
  withParams("/help/topic", { screen, lang });

export type HelpGuideEdition = "full" | "quick";

/** The printable guide (N16): `full` = User Guide, `quick` = Quick Start card. Public PDF. */
export const helpGuideHref = (edition: HelpGuideEdition, lang?: string) =>
  withParams("/api/proxy/v1/help/guide", { edition, lang });

/** "m:ss" for a video-length pill. */
export function formatVideoLength(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

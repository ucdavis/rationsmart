"use client";

// N11: the ❓ "How to" button. It only sends the screen key; the topic screen
// looks the key up in the backend's map (contract §3). `lang` is the same
// override the screen passes to useT(), so help opens in the screen's language.
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/colors";
import { helpScreenHref, type HelpScreenKey } from "@/lib/help";
import { markHelpOpened } from "@/lib/help-draft";
import { useT, useUiLang } from "@/lib/i18n-ui";

export interface HelpButtonProps {
  screen: HelpScreenKey;
  lang?: string;
  /** Pre-login screens have no Toolbar: pin the button to the top-right corner. */
  floating?: boolean;
}

export function IcHelp({ size = 20, color = COLORS.darkAquamarineGreen }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="2" />
      <path
        d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 3.9"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.2" r="1.2" fill={color} />
    </svg>
  );
}

export default function HelpButton({ screen, lang, floating }: HelpButtonProps) {
  const router = useRouter();
  const uiLang = useUiLang(lang);
  const t = useT(lang);
  return (
    <button
      type="button"
      onClick={() => {
        markHelpOpened(screen);
        router.push(helpScreenHref(screen, uiLang));
      }}
      className="flex items-center justify-center rounded-xl bg-white p-2.5"
      style={{
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        minWidth: 40,
        minHeight: 40,
        border: "none",
        cursor: "pointer",
        ...(floating
          ? {
              position: "absolute",
              top: "max(12px, env(safe-area-inset-top))",
              right: 12,
              zIndex: 30,
            }
          : {}),
      }}
      aria-label={t("How to")}
      title={t("How to")}
    >
      <IcHelp />
    </button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import Toolbar from "@/components/Toolbar";
import { useT } from "@/lib/i18n-ui";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { COLORS } from "@/lib/colors";
import { helpFaqsHref, helpHomeHref } from "@/lib/help";

// English source strings stay as the identity/lookup key (see i18n-ui.ts)
// — item.title is passed through t() at render time, not translated here.
export default function HelpAndSupportPage() {
  const router = useRouter();
  const t = useT();
  const items: { title: string; onPress?: () => void }[] = [
    // N11: in-app help screens (outside (main), so they work before login).
    { title: "User Manual", onPress: () => router.push(helpHomeHref()) },
    { title: "FAQs", onPress: () => router.push(helpFaqsHref()) },
    {
      title: "Contact Us",
      onPress: () => {
        window.location.href = `mailto:${SUPPORT_EMAIL}`;
      },
    },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: COLORS.authenticWhite }}>
      <Toolbar type="back" title={t("Help & Support")} onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto px-3 pt-5 pb-8">
        {/* Single card containing all items separated by dividers */}
        <div
          className="bg-white"
          style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", overflow: "hidden" }}
        >
          {items.map((item, idx) => (
            <div key={idx}>
              <button
                onClick={item.onPress}
                // A row without a handler is disabled rather than looking
                // tappable but doing nothing.
                disabled={!item.onPress}
                className="w-full flex items-center justify-between text-left"
                style={{
                  background: "none",
                  border: "none",
                  cursor: item.onPress ? "pointer" : "default",
                  paddingInline: 16,
                  paddingBlock: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    color: COLORS.raisinBlack,
                  }}
                >
                  {t(item.title)}
                </span>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M7.5 4.5H4a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V10"
                    stroke={COLORS.darkSilver}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10.5 3H15v4.5"
                    stroke={COLORS.darkSilver}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M15 3L8.5 9.5"
                    stroke={COLORS.darkSilver}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {idx < items.length - 1 && (
                <div style={{ height: 1, backgroundColor: COLORS.webDivider, marginInline: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

// Admin Feeds — the landing view: three navigation cards (Feed Type, Feed
// Category, Feed). Split out of admin/feeds/page.tsx (audit B-17).

import Toolbar from "@/components/Toolbar";
import { ADMIN_BACKGROUND, COLORS } from "@/lib/colors";
import type { TabType } from "./shared";

export interface FeedsLandingProps {
  goToSection: (section: TabType) => void;
  onBack: () => void;
  t: (source: string) => string;
}

export default function FeedsLanding({ goToSection, onBack, t }: FeedsLandingProps) {
  return (
    <div className="flex flex-col min-h-screen" style={{ background: ADMIN_BACKGROUND }}>
      <Toolbar type="back" title={t("Feed Management")} onBack={onBack} />

      <div className="ml-3 mt-5">
        <p style={{ color: COLORS.darkSilver, fontSize: 14 }}>{t("Administration")}</p>
        <p
          style={{
            color: COLORS.raisinBlack,
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {t("Configure Resources")}
        </p>
      </div>

      <div className="px-3 mt-5 space-y-3">
        {[
          { key: "types" as TabType, label: t("Feed Type") },
          { key: "categories" as TabType, label: t("Feed Category") },
          { key: "feeds" as TabType, label: t("Feed") },
        ].map((c) => (
          <button
            key={c.key}
            onClick={() => goToSection(c.key)}
            className="w-full flex items-center justify-between bg-white"
            style={{
              borderRadius: 16,
              padding: "16px 16px 16px 14px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
              border: "none",
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* left green accent bar */}
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 12,
                bottom: 12,
                width: 4,
                borderRadius: 2,
                backgroundColor: COLORS.darkAquamarineGreen,
              }}
            />
            <span
              className="font-bold"
              style={{
                color: COLORS.darkAquamarineGreen,
                fontSize: 16,
                paddingLeft: 8,
              }}
            >
              {t(c.label)}
            </span>
            <span
              className="flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: COLORS.brightGrayNew,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M5 3l4 4-4 4"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

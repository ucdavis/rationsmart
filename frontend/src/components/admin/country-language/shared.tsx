"use client";

// Admin > Country/Language — split out of admin/country-language/page.tsx (audit B-17).

import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";

export interface SystemLanguage {
  code: string;
  name: string;
  is_active: boolean;
}
export interface CountryRow {
  id: string;
  name: string;
  country_code?: string;
  is_active: boolean;
  languages: string[];
}
export interface InactiveCountryRow {
  id: string;
  name: string;
  country_code: string;
  is_active: boolean;
}
export interface FeedTranslation {
  feed_id: string;
  language: string;
  name: string;
  action?: "inserted" | "updated" | null;
}
export interface AdminFeedLite {
  feed_id: string;
  fd_name: string;
}
export interface UploadSummary {
  success?: boolean;
  message?: string;
  feeds_inserted?: number;
  feeds_updated?: number;
  feeds_skipped?: number;
  types_inserted?: number;
  types_updated?: number;
  types_skipped?: number;
  categories_inserted?: number;
  categories_updated?: number;
  categories_skipped?: number;
  errors?: string[];
}
export type Tab = "countries" | "feeds";
export type ConfirmState = {
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
} | null;
export const inputStyle = {
  backgroundColor: COLORS.americanDiamond,
  color: COLORS.raisinBlack,
};
export const cardStyle = { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };
export const sheetOverlayStyle = {
  left: COLUMN_LEFT,
  width: COLUMN_WIDTH,
  backgroundColor: "rgba(0,0,0,0.65)",
};

// ── Skeleton loading states (shimmer pattern from admin/users, admin/feeds,
// admin/reports — same `.shimmer` CSS keyframe, shaped to each real row). ──
export function SkeletonCardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
      <div
        className="px-4 py-3"
        style={{
          backgroundColor: COLORS.brightGrayNew,
          borderBottom: `1px solid ${COLORS.americanDiamond}`,
        }}
      >
        <p
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: COLORS.darkAquamarineGreen, opacity: 0.5 }}
        >
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}
export function SkeletonCountryRow() {
  return (
    <div className="px-4 py-3" style={{ borderTop: `1px solid ${COLORS.authenticWhite}` }}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-28 rounded-full shimmer" />
          <div className="h-3 w-20 rounded-full shimmer" />
        </div>
        <div className="h-7 w-12 rounded-full shimmer flex-shrink-0" />
      </div>
      <div className="flex gap-1.5 mt-3">
        <div className="h-6 w-16 rounded-full shimmer" />
        <div className="h-6 w-20 rounded-full shimmer" />
      </div>
    </div>
  );
}
export function SkeletonLanguageRow() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderTop: `1px solid ${COLORS.authenticWhite}` }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-24 rounded-full shimmer" />
        <div className="h-3 w-32 rounded-full shimmer" />
      </div>
      <div className="h-7 w-12 rounded-full shimmer flex-shrink-0" />
    </div>
  );
}
export function SkeletonPickerRow() {
  return (
    <div
      className="flex items-center justify-between px-3 py-2.5 rounded-xl"
      style={{ border: `1px solid ${COLORS.gainsboro}` }}
    >
      <div className="h-4 w-28 rounded-full shimmer" />
      <div className="h-3 w-14 rounded-full shimmer" />
    </div>
  );
}
export function SkeletonFeedRow() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderTop: `1px solid ${COLORS.authenticWhite}` }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-32 rounded-full shimmer" />
        <div className="h-3 w-20 rounded-full shimmer" />
      </div>
      <div className="h-5 w-16 rounded-full shimmer flex-shrink-0" />
    </div>
  );
}

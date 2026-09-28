"use client";

// Admin > Feed Management — types, form defaults and small inputs; split out of admin/feeds/page.tsx (audit B-17).

import { COLORS } from "@/lib/colors";

export interface AdminFeedType {
  id: string;
  type_name?: string;
  name?: string;
  description?: string;
  is_active?: boolean;
  status?: string;
}
export interface AdminFeedCategory {
  id: string;
  category_name?: string;
  name?: string;
  feed_type?: { id: string; type_name?: string } | string;
  feed_type_id?: string;
  description?: string;
  is_active?: boolean;
  status?: string;
}
export interface AdminFeed {
  feed_id?: string;
  fd_name?: string;
  fd_type?: string;
  fd_category?: string;
  fd_country_name?: string;
  fd_country_id?: string;
  fd_dm?: number;
  fd_cp?: number;
  fd_ee?: number;
  fd_cf?: number;
  fd_ash?: number;
  fd_ndf?: number;
  fd_adf?: number;
  fd_ca?: number;
  fd_p?: number;
  fd_st?: number;
  fd_code?: string;
  fd_country_cd?: string;
  fd_cellulose?: number | string;
  fd_hemicellulose?: number | string;
  fd_lg?: number | string;
  fd_ndin?: number | string;
  fd_nfe?: number | string;
  fd_npn_cp?: number | string;
  fd_adin?: number | string;
  fd_ipb_local_lab?: string;
  fd_orginin?: string;
  fd_season?: string;
}
export interface Country {
  id: string | number;
  name: string;
  country_code?: string;
}
export type TabType = "feeds" | "types" | "categories";

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function SkeletonCard() {
  return (
    <div
      className="mx-3 my-2 rounded-2xl bg-white p-4 space-y-3"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      <div className="h-4 w-40 rounded-full shimmer" />
      <div className="h-3 w-28 rounded-full shimmer" />
    </div>
  );
}
export function NutrientInput({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase mb-1" style={{ color: COLORS.darkSilver }}>
        {label}
        {required && " *"}
      </p>
      <input
        aria-label={label}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full rounded-xl px-3 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
        style={{ backgroundColor: COLORS.americanDiamond, color: COLORS.raisinBlack }}
      />
    </div>
  );
}
export const emptyFeedForm = {
  fd_name: "",
  fd_type: "",
  fd_category: "",
  fd_country_name: "",
  fd_country_cd: "",
  fd_country_id: "",
  fd_dm: "",
  fd_cp: "",
  fd_ee: "",
  fd_cf: "",
  fd_ash: "",
  fd_ndf: "",
  fd_adf: "",
  fd_ca: "",
  fd_p: "",
  fd_st: "",
  fd_code: "",
  fd_cellulose: "",
  fd_hemicellulose: "",
  fd_lg: "",
  fd_ndin: "",
  fd_nfe: "",
  fd_npn_cp: "",
  fd_adin: "",
  fd_ipb_local_lab: "",
  fd_orginin: "",
  fd_season: "",
};
export const NUMERIC_FEED_FIELDS = [
  "fd_dm",
  "fd_cp",
  "fd_ee",
  "fd_cf",
  "fd_ash",
  "fd_ndf",
  "fd_adf",
  "fd_ca",
  "fd_p",
  "fd_st",
  "fd_cellulose",
  "fd_hemicellulose",
  "fd_lg",
  "fd_ndin",
  "fd_nfe",
  "fd_npn_cp",
  "fd_adin",
] as const satisfies ReadonlyArray<keyof typeof emptyFeedForm>;

// ─── Page ─────────────────────────────────────────────────────────────────────

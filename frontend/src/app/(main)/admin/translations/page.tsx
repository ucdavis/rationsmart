"use client";

// Legacy route. Translation work — workbook export/import, per-feed names and
// the coverage check — all lives on Admin > Country/Language's Feed Names tab
// now; this screen duplicated the workbook half of it (audit B-18,
// 2026-09-28). Kept as a redirect for bookmarks.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminTranslationsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/country-language?tab=feeds");
  }, [router]);
  return null;
}

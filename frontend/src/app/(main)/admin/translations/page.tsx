"use client";

// 2026-07-15 — Merged into /admin/languages (Option 3 "control room"
// from ~/Downloads/admin_language_api_and_ui_design.md). The Translations
// card is removed from the Admin grid; everything it did — workbook
// export/import, coverage — now lives inside the Countries tab's
// per-country detail + the shared Translation Workspace. Keep this file
// as a redirect so any saved bookmarks or links in chat still reach the
// right place.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminTranslationsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/languages");
  }, [router]);
  return null;
}

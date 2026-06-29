"use client";

// 2026-06-29 — This route has been merged into /admin/languages. The
// unified screen there now handles both the catalog (add a language)
// AND the per-country toggle that this page used to own. Keep this
// file as a redirect so any saved bookmarks or links in chat still
// reach the right place.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminCountryLanguagesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/languages");
  }, [router]);
  return null;
}

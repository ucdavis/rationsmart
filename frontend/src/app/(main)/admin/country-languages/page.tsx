"use client";

// Legacy route kept as a redirect for old bookmarks. It first merged into
// /admin/languages (2026-06-29); that screen was itself unlinked from the
// admin landing on 2026-07-20 in favour of /admin/country-language, so the
// redirect now goes straight to the live screen.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminCountryLanguagesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/country-language");
  }, [router]);
  return null;
}

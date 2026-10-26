"use client";

// Legacy route. The Language Catalog screen that lived here was unlinked from
// the admin landing on 2026-07-20 when /admin/country-language replaced it;
// that screen covers everything this one did (catalog add / activate /
// deactivate, per-country assign / unassign) plus feed-name translations. The
// duplicate implementation was removed (audit B-18 / D-06, 2026-09-28) and
// the route kept as a redirect so old bookmarks still land somewhere useful.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLanguagesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/country-language");
  }, [router]);
  return null;
}

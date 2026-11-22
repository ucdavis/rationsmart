"use client";

// N11 Help home (Help › User Manual). Outside (main) so it also works before
// login. The screen itself is shared with the Admin Manual (ManualHome).
import { Suspense } from "react";
import ManualHome from "@/components/help/ManualHome";
import { useUserManualSource } from "@/components/help/manual-source";

function HelpHome() {
  return <ManualHome source={useUserManualSource()} />;
}

export default function HelpHomePage() {
  // useSearchParams must be inside Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <HelpHome />
    </Suspense>
  );
}

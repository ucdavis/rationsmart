"use client";

// N11 topic screen (?key= or ?screen=, see ManualTopic). Outside (main) so it
// also works before login; the screen is shared with the Admin Manual.
import { Suspense } from "react";
import ManualTopic from "@/components/help/ManualTopic";
import { useUserManualSource } from "@/components/help/manual-source";

function HelpTopicScreen() {
  return <ManualTopic source={useUserManualSource()} />;
}

export default function HelpTopicPage() {
  // useSearchParams must be inside Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <HelpTopicScreen />
    </Suspense>
  );
}

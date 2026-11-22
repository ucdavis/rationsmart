"use client";

// N19 Admin Manual topic (?key=). A 404 goes back to the Admin Manual list;
// 503 / no internet go back with the help message. A 403 is the admin
// layout's business (the user isn't an admin any more).
import { Suspense } from "react";
import ManualTopic from "@/components/help/ManualTopic";
import { useAdminManualSource } from "@/components/help/manual-source";

function AdminManualTopic() {
  return <ManualTopic source={useAdminManualSource()} />;
}

export default function AdminManualTopicPage() {
  // useSearchParams must be inside Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <AdminManualTopic />
    </Suspense>
  );
}

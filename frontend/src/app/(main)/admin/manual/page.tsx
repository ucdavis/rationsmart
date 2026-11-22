"use client";

// N19 Admin Manual list (Admin › Admin Manual). Inside admin/, so the admin
// layout's role guard applies; the screen is the User Manual's (ManualHome).
import { Suspense } from "react";
import ManualHome from "@/components/help/ManualHome";
import { useAdminManualSource } from "@/components/help/manual-source";

function AdminManualHome() {
  return <ManualHome source={useAdminManualSource()} />;
}

export default function AdminManualPage() {
  // useSearchParams must be inside Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <AdminManualHome />
    </Suspense>
  );
}

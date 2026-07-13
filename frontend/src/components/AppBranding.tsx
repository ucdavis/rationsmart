"use client";

import Image from "next/image";
import { useT } from "@/lib/i18n-ui";

export default function AppBranding() {
  const t = useT();
  return (
    <div className="flex flex-col items-center">
      {/* Circular logo card */}
      <div
        className="w-20 h-20 rounded-full overflow-hidden"
        style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}
      >
        <Image
          src="/images/app_logo.png"
          alt="RationSmart"
          width={80}
          height={80}
          className="w-full h-full object-cover"
          priority
        />
      </div>

      {/* App name */}
      <p
        className="mt-3 text-xl font-bold"
        style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
      >
        {t("RationSmart")}
      </p>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import AppBranding from "@/components/AppBranding";
import PoweredBy from "@/components/PoweredBy";

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      {/* Top: App Branding */}
      <div className="flex justify-center pt-5 pb-2">
        <AppBranding />
      </div>

      {/* Illustration + tagline. The image is a 2048×2048 (1:1) PNG, so we
          render it with width:100% / height:auto so it scales preserving
          aspect ratio — no cropping at top/bottom. Pinned to the bottom of
          the flex-1 area (Android ImageView default scaleType=fitCenter
          between branding bottom and tagline top). */}
      <div className="flex-1 flex flex-col items-center justify-end px-3 pb-2">
        <Image
          src="/images/ic_welcome_image.png"
          alt="Welcome illustration"
          width={400}
          height={400}
          style={{ width: "100%", height: "auto", maxWidth: 360 }}
          priority
        />

        {/* Tagline — small gap below image, matches Android offset_20 */}
        <div className="mt-3 px-4 text-center">
          <p
            className="text-xl font-bold leading-snug"
            style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", whiteSpace: "pre-line" }}
          >
            {"Smart feeding.\nMaximum yield.\nMinimal cost."}
          </p>
        </div>
      </div>

      {/* Bottom: CTA button + powered by */}
      <div className="px-3 pb-8">
        <button
          onClick={() => router.push("/login")}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-full font-bold text-base text-white"
          style={{
            backgroundColor: "#064E3B",
            fontFamily: "Nunito, sans-serif",
            boxShadow: "0 4px 14px rgba(6,78,59,0.28)",
          }}
        >
          <span>Continue</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="mt-5">
          <PoweredBy />
        </div>
      </div>
    </div>
  );
}

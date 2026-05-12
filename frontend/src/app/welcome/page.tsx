"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import AppBranding from "@/components/AppBranding";
import PoweredBy from "@/components/PoweredBy";
import { IcForward } from "@/components/Icons";

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

      {/* Illustration */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-4">
        <div
          className="w-full rounded-2xl overflow-hidden flex items-center justify-center"
          style={{ maxWidth: 340, height: 240 }}
        >
          <Image
            src="/images/ic_welcome_image.png"
            alt="Welcome illustration"
            width={340}
            height={240}
            className="object-cover w-full h-full"
            priority
          />
        </div>

        {/* Tagline */}
        <div className="mt-6 px-4 text-center">
          <p
            className="text-xl font-bold leading-snug"
            style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
          >
            Smart feeding.{"\n"}Maximum yield.{"\n"}Minimal cost.
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
          <IcForward size={20} color="#FFFFFF" />
        </button>

        <div className="mt-5">
          <PoweredBy />
        </div>
      </div>
    </div>
  );
}

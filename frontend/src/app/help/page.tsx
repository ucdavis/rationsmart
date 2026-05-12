"use client";

import { useRouter } from "next/navigation";
import Toolbar from "@/components/Toolbar";

const items = [
  {
    title: "User Manual",
    onPress: undefined as (() => void) | undefined,
  },
  {
    title: "FAQs",
    onPress: undefined as (() => void) | undefined,
  },
  {
    title: "Contact Us",
    onPress: () => { window.location.href = "mailto:admin@digitalgreen.org"; },
  },
];

export default function HelpAndSupportPage() {
  const router = useRouter();

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar type="back" title="Help & Support" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto px-3 pt-5 pb-8">
        {/* Single card containing all items separated by dividers */}
        <div
          className="bg-white"
          style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", overflow: "hidden" }}
        >
          {items.map((item, idx) => (
            <div key={idx}>
              <button
                onClick={item.onPress}
                className="w-full flex items-center justify-between text-left"
                style={{
                  background: "none",
                  border: "none",
                  cursor: item.onPress ? "pointer" : "default",
                  paddingInline: 16,
                  paddingBlock: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "Nunito, sans-serif",
                    fontSize: 16,
                    color: "#231F20",
                  }}
                >
                  {item.title}
                </span>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M7.5 4.5H4a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V10" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M10.5 3H15v4.5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 3L8.5 9.5" stroke="#6D6D6D" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              {idx < items.length - 1 && (
                <div style={{ height: 1, backgroundColor: "#E2E8F0", marginInline: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

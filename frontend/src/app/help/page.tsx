"use client";

import { useRouter } from "next/navigation";
import Toolbar from "@/components/Toolbar";

interface HelpItem {
  icon: React.ReactNode;
  title: string;
  description: string;
  onPress?: () => void;
}

export default function HelpAndSupportPage() {
  const router = useRouter();

  const items: HelpItem[] = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      title: "User Manual",
      description: "Learn how to use RationSmart effectively",
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#064E3B" strokeWidth="1.8"/>
          <path d="M12 8v4l3 3" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="12" cy="17" r="0.8" fill="#064E3B"/>
        </svg>
      ),
      title: "FAQs",
      description: "Frequently asked questions and answers",
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16l.19.92z" stroke="#064E3B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      title: "Contact Us",
      description: "Get in touch with our support team",
      onPress: () => { window.location.href = "mailto:admin@digitalgreen.org"; },
    },
  ];

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar type="back" title="Help & Support" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
        {/* Banner */}
        <div
          className="rounded-2xl bg-white px-4 py-5 mb-4 flex items-center gap-4"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          <div
            className="flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ width: 56, height: 56, backgroundColor: "#F0FDF4" }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="11" stroke="#064E3B" strokeWidth="2"/>
              <path d="M14 9v6l3 3" stroke="#064E3B" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
              How can we help?
            </p>
            <p className="text-sm mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
              Find answers, read guides, or contact us
            </p>
          </div>
        </div>

        {/* Help items */}
        {items.map((item, idx) => (
          <button
            key={idx}
            onClick={item.onPress}
            className="w-full text-left"
            style={{ background: "none", border: "none", padding: 0, cursor: item.onPress ? "pointer" : "default" }}
          >
            <div
              className="rounded-2xl bg-white px-4 py-4 mb-3 flex items-center gap-4"
              style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
            >
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: 48, height: 48, backgroundColor: "#F0FDF4" }}
              >
                {item.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                  {item.title}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                  {item.description}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="#E2E8F0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </button>
        ))}

        {/* Support email card */}
        <div
          className="rounded-2xl px-4 py-4 mt-2"
          style={{ backgroundColor: "#F0FDF4", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
        >
          <p className="text-xs font-bold uppercase mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            Support Email
          </p>
          <p className="text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            admin@digitalgreen.org
          </p>
        </div>
      </div>
    </div>
  );
}

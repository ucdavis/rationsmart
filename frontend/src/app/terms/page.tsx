"use client";

import { useRouter } from "next/navigation";
import Toolbar from "@/components/Toolbar";

const TERMS_SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    content:
      "By accessing and using RationSmart, you accept and agree to be bound by these Terms and Conditions. If you do not agree, please do not use the application.",
  },
  {
    title: "2. Use of Service",
    content:
      "RationSmart is designed to assist livestock farmers and agricultural professionals in optimizing cattle feed formulation. The recommendations provided are based on scientific models and should be used as advisory information only.",
  },
  {
    title: "3. Data Privacy",
    content:
      "We collect and process data necessary to provide the feed formulation service. Your data is handled in accordance with applicable data protection laws. We do not sell your personal data to third parties.",
  },
  {
    title: "4. Accuracy of Information",
    content:
      "While we strive to provide accurate and up-to-date recommendations, Digital Green does not warrant that the information is complete, reliable, or suitable for any particular purpose. Consult a qualified veterinarian or nutritionist for critical decisions.",
  },
  {
    title: "5. Account Responsibility",
    content:
      "You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account.",
  },
  {
    title: "6. Intellectual Property",
    content:
      "All content, logos, and software within RationSmart are the property of Digital Green Foundation. You may not reproduce or distribute any part of the service without written permission.",
  },
  {
    title: "7. Limitation of Liability",
    content:
      "Digital Green Foundation shall not be liable for any indirect, incidental, special, or consequential damages arising from use of RationSmart or reliance on its recommendations.",
  },
  {
    title: "8. Changes to Terms",
    content:
      "We reserve the right to modify these terms at any time. Continued use of the application after changes constitutes acceptance of the updated terms.",
  },
  {
    title: "9. Contact",
    content:
      "For questions about these Terms and Conditions, please contact us at admin@digitalgreen.org.",
  },
];

export default function TermsPage() {
  const router = useRouter();

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar type="back" title="Terms & Conditions" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
        {/* Header card */}
        <div
          className="rounded-2xl bg-white px-4 py-5 mb-4"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          <p className="text-base font-bold mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
            Terms & Conditions
          </p>
          <p className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
            Last updated: January 2025 · Digital Green Foundation
          </p>
        </div>

        {/* Terms sections */}
        {TERMS_SECTIONS.map((section, idx) => (
          <div
            key={idx}
            className="rounded-2xl bg-white px-4 py-4 mb-3"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
          >
            <p
              className="text-sm font-bold mb-2"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
            >
              {section.title}
            </p>
            <p
              className="text-sm"
              style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", lineHeight: 1.6 }}
            >
              {section.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

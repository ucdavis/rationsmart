"use client";

// Bottom-sheet popup mirroring Android's DialogFeedbackDetails.
// Shows the full feedback breakdown when a feedback card is tapped
// on either /feedback (user's own history) or /admin/feedback (admin
// list). Android source:
//   app/src/main/java/.../ui/dialogs/DialogFeedbackDetails.kt
//   app/src/main/res/layout/dialog_feedback_details.xml
//
// Layout (top to bottom):
//   • Drag handle (mint pill)
//   • "Your Rating" title (dark_aquamarine_green, 20sp bold)
//   • 5-star row (mustard for filled, silver_sand for empty)
//   • Two info tiles side by side (honeydew bg):
//     Date tile  — calendar icon + "Date" label above the value
//     Category tile — category icon + "Category" label above the value
//   • "Your Feedback" title + honeydew card containing the full text

import { toFeedReportDisplayDate } from "@/lib/validators";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { useEscapeKey } from "@/lib/use-escape";
import { COLORS } from "@/lib/colors";
import { useT } from "@/lib/i18n-ui";

export interface FeedbackDetails {
  rating: number;
  category: string;
  createdAt: string;
  text: string;
}

export default function FeedbackDetailsSheet({
  details,
  onClose,
}: {
  details: FeedbackDetails | null;
  onClose: () => void;
}) {
  // Hooks before the early return (rules-of-hooks).
  const t = useT();
  useEscapeKey(!!details, onClose);
  if (!details) return null;

  const rating = Math.max(0, Math.min(5, details.rating || 0));

  return (
    <div
      className="fixed top-0 h-full z-50 flex flex-col justify-end"
      style={{
        left: COLUMN_LEFT,
        width: COLUMN_WIDTH,
        backgroundColor: "rgba(0,0,0,0.65)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-t-2xl px-4 pt-5 pb-6"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-3">
          <div
            style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: COLORS.goGreen15 }}
          />
        </div>

        {/* Your Rating heading */}
        <p
          className="text-center font-bold"
          style={{ color: COLORS.darkAquamarineGreen, fontSize: 20 }}
        >
          {t("Your Rating")}
        </p>

        {/* 5-star row */}
        <div className="flex justify-center items-center gap-1 mt-2.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <svg
              key={n}
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill={n <= rating ? COLORS.mustard : COLORS.silverSand}
              aria-hidden
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ))}
        </div>

        {/* Date + Category info tiles */}
        <div className="flex gap-3 mt-6 px-1">
          <InfoTile
            label={t("Date")}
            value={toFeedReportDisplayDate(details.createdAt)}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect
                  x="3.5"
                  y="5"
                  width="17"
                  height="16"
                  rx="2"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="1.8"
                />
                <path
                  d="M3.5 10h17M8 3v4M16 3v4"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            }
          />
          <InfoTile
            label={t("Category")}
            value={details.category || "N/A"}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect
                  x="3.5"
                  y="3.5"
                  width="7"
                  height="7"
                  rx="1.5"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="1.8"
                />
                <rect
                  x="13.5"
                  y="3.5"
                  width="7"
                  height="7"
                  rx="1.5"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="1.8"
                />
                <rect
                  x="3.5"
                  y="13.5"
                  width="7"
                  height="7"
                  rx="1.5"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="1.8"
                />
                <rect
                  x="13.5"
                  y="13.5"
                  width="7"
                  height="7"
                  rx="1.5"
                  stroke={COLORS.darkAquamarineGreen}
                  strokeWidth="1.8"
                />
              </svg>
            }
          />
        </div>

        {/* Your Feedback label + text card */}
        <p
          className="font-bold mt-6"
          style={{
            color: COLORS.darkSilver,
            fontSize: 14,
            marginLeft: 4,
          }}
        >
          {t("Your Feedback")}
        </p>
        <div
          className="mt-2 rounded-2xl px-4 py-4"
          style={{
            backgroundColor: COLORS.honeydew,
            border: "1px solid rgba(5,188,109,0.15)",
          }}
        >
          <p
            className="font-bold text-base"
            style={{ color: COLORS.darkAquamarineGreen, lineHeight: 1.5 }}
          >
            {details.text?.trim() || t("Feedback not provided!")}
          </p>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-full mt-6 py-3 rounded-xl font-bold"
          style={{
            backgroundColor: COLORS.darkAquamarineGreen,
            color: COLORS.white,
            border: "none",
            cursor: "pointer",
          }}
        >
          {t("Close")}
        </button>
      </div>
    </div>
  );
}

function InfoTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div
      className="flex-1 flex items-center gap-2 rounded-2xl px-3 py-3"
      style={{ backgroundColor: COLORS.honeydew }}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p
          className="uppercase"
          style={{
            color: COLORS.darkSilver,
            fontSize: 11,
            letterSpacing: 0.4,
          }}
        >
          {label}
        </p>
        <p
          className="font-bold truncate"
          style={{ color: COLORS.raisinBlack, fontSize: 14 }}
          title={value}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

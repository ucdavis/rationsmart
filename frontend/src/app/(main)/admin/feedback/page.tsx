"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getAdminFeedbacks, getAdminFeedbackStats } from "@/lib/api";
import { toFeedReportDisplayDate } from "@/lib/validators";
import Toolbar from "@/components/Toolbar";
import { IcStar } from "@/components/Icons";

interface AdminFeedback {
  id: number;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  feedback_type?: string;
  text_feedback?: string;
  overall_rating?: number;
  created_at: string;
}

interface FeedbackStats {
  total_feedbacks?: number;
  overall_rating?: number;
  average_rating?: number;
  feedback_by_type?: Record<string, number>;
  by_category?: Record<string, number>;
}

// Category styling — mirrors Android AdminFeedbackListAdapter exactly:
// icon container: solid category color with white icon inside;
// pill: light tinted bg with dark category color text.
type CategoryStyle = {
  iconBg: string;
  badgeBg: string;
  badgeText: string;
  icon: React.ReactNode;
};

const categoryStyle = (cat: string): CategoryStyle => {
  // White icon stroked
  const w = "#FFFFFF";
  switch (cat) {
    case "Defect":
      return {
        iconBg: "#E44A4A",            // carmine_pink
        badgeBg: "rgba(228,74,74,0.2)",
        badgeText: "#FC2E20",          // red_ryb
        // ic_bug
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M8 8V6a4 4 0 0 1 8 0v2M5 12h14M6 19h12a2 2 0 0 0 2-2v-5a8 8 0 0 0-16 0v5a2 2 0 0 0 2 2zM12 12v9M4 8l3 2M20 8l-3 2M4 21l3-2M20 21l-3-2" stroke={w} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      };
    case "Feature Request":
      return {
        iconBg: "#1E40AF",             // ultramarine
        badgeBg: "rgba(30,64,175,0.15)",
        badgeText: "#1E40AF",
        // ic_idea (lightbulb)
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.9.7 1.6 1.5 2 2.3h4c.4-.8 1.1-1.6 2-2.3A7 7 0 0 0 12 2z" stroke={w} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      };
    default:
      // "General"
      return {
        iconBg: "#064E3B",             // dark_aquamarine_green
        badgeBg: "rgba(5,188,109,0.15)",
        badgeText: "#064E3B",
        // ic_feedback_nav (chat bubble)
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={w} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      };
  }
};

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        // Android `mustard` (#FFDB58) filled; `silver_sand` (#C2C2C2) empty
        <IcStar key={s} size={16} filled={s <= rating} color={s <= rating ? "#FFDB58" : "#C2C2C2"} />
      ))}
    </div>
  );
}

export default function AdminFeedbackPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));

  const [feedbacks, setFeedbacks] = useState<AdminFeedback[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    setIsLoading(true);
    Promise.all([
      getAdminFeedbacks(user.id, 50, 0),
      getAdminFeedbackStats(user.id),
    ])
      .then(([fbRes, statsRes]) => {
        const data = fbRes.data;
        setFeedbacks(Array.isArray(data) ? data : data?.feedbacks ?? []);
        setStats(statsRes.data ?? null);
      })
      .catch(() => showSnackbar("Could not load feedback", "error"))
      .finally(() => setIsLoading(false));
  }, [user?.id]);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)" }}>
      <Toolbar type="back" title="Feedback Management" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pt-2 pb-6">
        {/* Stats cards */}
        {stats && (
          <>
            <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, margin: "14px 10px 0" }}>Aggregated Insights</p>
            <div className="flex gap-3 mx-2.5 mt-4 mb-2">
              <div className="flex-1 bg-white p-2.5" style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                <p className="font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>Total Feedbacks</p>
                <p className="font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 28 }}>{stats.total_feedbacks ?? feedbacks.length}</p>
              </div>
              <div className="flex-1 bg-white p-2.5" style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                <p className="font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>Overall Rating</p>
                {/* Match Android tv_overall_rating: 2 decimal places (e.g. 3.83, 3.95).
                    The previous .toFixed(1) was rounding 3.95 to "4.0". */}
                <p className="font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 28 }}>{(stats.overall_rating ?? stats.average_rating)?.toFixed(2) ?? "—"}</p>
              </div>
            </div>
          </>
        )}

        <p className="font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16, margin: "10px 12px 4px" }}>Feedbacks</p>

        {isLoading ? (
          [0,1,2].map((i) => (
            <div key={i} className="mx-3 my-2 rounded-2xl bg-white p-4 space-y-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div className="h-4 w-24 rounded-full shimmer" />
              <div className="h-3 w-full rounded-full shimmer" />
              <div className="h-3 w-3/4 rounded-full shimmer" />
            </div>
          ))
        ) : feedbacks.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-center px-6">
            <p className="text-base" style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}>No feedbacks found</p>
          </div>
        ) : (
          feedbacks.map((fb) => {
            const category = fb.feedback_type ?? "General";
            const cs = categoryStyle(category);
            return (
              <div
                key={fb.id}
                className="mx-3 my-2 bg-white"
                style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", paddingBottom: 12 }}
              >
                {/* Top row: icon pill + name/email LEFT | category badge + stars RIGHT */}
                <div className="flex items-start justify-between" style={{ padding: "12px 12px 0" }}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: cs.iconBg, borderRadius: 16, padding: 10 }}
                    >
                      {cs.icon}
                    </div>
                    {/* Name (font_16 bold raisin_black) + Email always rendered
                        (font_12 regular raisin_black, "N/A" if missing) —
                        matches AdminFeedbackListAdapter.kt:81+79 which sets both
                        unconditionally via toStringOrNA(). */}
                    <div className="min-w-0">
                      <p className="font-bold truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}>
                        {fb.user_name || "N/A"}
                      </p>
                      <p className="truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>
                        {fb.user_email || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 ml-2">
                    <span
                      className="text-xs font-bold uppercase"
                      style={{ backgroundColor: cs.badgeBg, color: cs.badgeText, fontFamily: "Nunito, sans-serif", padding: "2px 10px", borderRadius: 50 }}
                    >
                      {category}
                    </span>
                    <div className="mt-1">
                      <StarRow rating={fb.overall_rating ?? 0} />
                    </div>
                  </div>
                </div>
                {/* Feedback text — Android falls back to "Feedback not provided!"
                    when the field is empty (AdminFeedbackListAdapter.kt:80). */}
                <p
                  className="text-sm"
                  style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", margin: "14px 12px 0", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}
                >
                  {fb.text_feedback || "Feedback not provided!"}
                </p>
                {/* Date */}
                <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12, margin: "10px 12px 0" }}>
                  {toFeedReportDisplayDate(fb.created_at)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

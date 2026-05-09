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

const categoryBadge = (cat: string) => {
  const map: Record<string, { bg: string; color: string }> = {
    General: { bg: "rgba(5,188,109,0.15)", color: "#064E3B" },
    "Feature Request": { bg: "rgba(30,64,175,0.15)", color: "#1E40AF" },
    Defect: { bg: "rgba(228,74,74,0.2)", color: "#E44A4A" },
  };
  return map[cat] ?? { bg: "#F1F5F9", color: "#6D6D6D" };
};

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <IcStar key={s} size={14} filled={s <= rating} color={s <= rating ? "#064E3B" : "#E4F7EF"} />
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
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="Feedback Management" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pt-2 pb-6">
        {/* Stats card */}
        {stats && (
          <div
            className="mx-3 my-2 rounded-2xl bg-white p-4"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Total Feedbacks</p>
                <p className="text-xl font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{stats.total_feedbacks ?? feedbacks.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>Avg Rating</p>
                <div className="flex items-center gap-1 justify-end">
                  <p className="text-xl font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>{(stats.overall_rating ?? stats.average_rating)?.toFixed(1) ?? "—"}</p>
                  <IcStar size={16} filled color="#064E3B" />
                </div>
              </div>
            </div>
          </div>
        )}

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
            const category = fb.feedback_type ?? "";
            const colors = categoryBadge(category);
            return (
              <div
                key={fb.id}
                className="mx-3 my-2 rounded-2xl bg-white p-4"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: colors.bg, color: colors.color, fontFamily: "Nunito, sans-serif" }}
                  >
                    {category || "General"}
                  </span>
                  <StarRow rating={fb.overall_rating ?? 0} />
                </div>
                {(fb.user_name || fb.user_email) && (
                  <p className="text-xs mb-1" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>
                    {fb.user_name ?? fb.user_email}
                  </p>
                )}
                <p className="text-sm" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                  {fb.text_feedback ?? ""}
                </p>
                <p className="text-xs mt-2" style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}>
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

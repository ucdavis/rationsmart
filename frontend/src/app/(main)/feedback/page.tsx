"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { submitFeedback, getMyFeedback } from "@/lib/api";
import Toolbar from "@/components/Toolbar";
import { useRouter } from "next/navigation";
import { IcStar } from "@/components/Icons";

interface FeedbackItem {
  id: number;
  feedback_type: string;
  text_feedback: string;
  overall_rating: number;
  created_at: string;
}

const CATEGORIES = ["General", "Defect", "Feature Request"] as const;

function StarRating({
  rating,
  onChange,
  readOnly = false,
}: {
  rating: number;
  onChange?: (r: number) => void;
  readOnly?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readOnly && setHovered(star)}
          onMouseLeave={() => !readOnly && setHovered(0)}
          style={{ background: "none", border: "none", cursor: readOnly ? "default" : "pointer", padding: 2 }}
          aria-label={`${star} star`}
        >
          <IcStar
            size={28}
            filled={star <= (hovered || rating)}
            color={star <= (hovered || rating) ? "#FFC107" : "#C2C2C2"}
          />
        </button>
      ))}
    </div>
  );
}

const categoryBadgeStyle = (cat: string): React.CSSProperties => {
  const map: Record<string, { bg: string; color: string }> = {
    General: { bg: "rgba(5,188,109,0.15)", color: "#064E3B" },
    "Feature Request": { bg: "rgba(30,64,175,0.15)", color: "#1E40AF" },
    Defect: { bg: "rgba(228,74,74,0.2)", color: "#E44A4A" },
  };
  const colors = map[cat] ?? { bg: "#F1F5F9", color: "#6D6D6D" };
  return {
    backgroundColor: colors.bg,
    color: colors.color,
    fontFamily: "Nunito, sans-serif",
    fontWeight: 700,
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 50,
  };
};

export default function FeedbackPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({
    user: s.user,
    showSnackbar: s.showSnackbar,
  }));

  const [category, setCategory] = useState<string>("General");
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<FeedbackItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = () => {
    if (!user) return;
    setLoadingHistory(true);
    getMyFeedback(user.id)
      .then((res) => {
        const data = res.data;
        setHistory(Array.isArray(data) ? data : data?.feedbacks ?? []);
      })
      .catch(() => showSnackbar("Could not load feedback history", "error"))
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => { loadHistory(); }, [user]);

  const handleSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const payload: { feedback_type: string; text_feedback?: string; overall_rating?: number } = {
        feedback_type: category,
      };
      if (text.trim()) payload.text_feedback = text.trim();
      if (rating > 0) payload.overall_rating = rating;
      await submitFeedback(user.id, payload);
      showSnackbar("Thank you for your feedback!", "success");
      setText("");
      setRating(0);
      setCategory("General");
      loadHistory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Submission failed";
      showSnackbar(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelStyle = {
    color: "#6D6D6D",
    fontFamily: "Nunito, sans-serif",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    display: "block",
    marginBottom: 8,
  };

  const canSubmit = text.trim().length > 0 || rating > 0;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar type="back" title="Feedback" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pb-8">
        {/* Submit Feedback card */}
        <div
          className="mx-3 mt-3 rounded-2xl bg-white px-4 py-5"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          {/* Category */}
          <label style={labelStyle}>Category</label>
          <div className="flex gap-3 flex-wrap mt-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm"
                style={{
                  backgroundColor: category === c ? "#064E3B" : "#F1F5F9",
                  color: category === c ? "#FFFFFF" : "#231F20",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "Nunito, sans-serif",
                  transition: "all 0.15s",
                }}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Rating */}
          <p
            className="text-center text-lg font-bold mt-5 mb-3"
            style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
          >
            Rate The App
          </p>
          <div className="flex justify-center">
            <StarRating rating={rating} onChange={setRating} />
          </div>
          {rating > 0 && (
            <p
              className="text-xs mt-1.5"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
            >
              {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][rating]}
            </p>
          )}

          {/* Text */}
          <label style={{ ...labelStyle, marginTop: 16 }}>Feedback</label>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Tell us what you think, report a bug, or suggest a feature..."
            className="w-full rounded-2xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark resize-none"
            style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
          />
          <p
            className="text-xs text-right mt-1"
            style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}
          >
            {text.length} / 1000
          </p>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full mt-4 py-4 rounded-full font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor: canSubmit && !isSubmitting ? "#064E3B" : "#D3D3D3",
              color: canSubmit && !isSubmitting ? "#FFFFFF" : "#999999",
              border: "none",
              fontFamily: "Nunito, sans-serif",
              cursor: canSubmit && !isSubmitting ? "pointer" : "not-allowed",
              transition: "background-color 0.2s",
            }}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                Submitting...
              </>
            ) : "Submit Feedback"}
          </button>
        </div>

        {/* My Feedback History */}
        <div className="mx-3 mt-4">
          <div className="flex items-center justify-between mb-3">
            <p
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
            >
              Your Feedbacks
            </p>
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "#F0FDF4", color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
            >
              {history.length} Total
            </span>
          </div>

          {loadingHistory ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white p-4 space-y-3"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
                >
                  <div className="h-4 w-24 rounded-full shimmer" />
                  <div className="h-3 w-full rounded-full shimmer" />
                  <div className="h-3 w-3/4 rounded-full shimmer" />
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div
              className="rounded-2xl bg-white p-8 text-center"
              style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
            >
              <p className="text-sm" style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}>
                No feedback submitted yet
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-white p-4 mb-3"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span style={categoryBadgeStyle(item.feedback_type)}>{item.feedback_type}</span>
                  <StarRating rating={item.overall_rating} readOnly />
                </div>
                <p
                  className="text-sm mt-1"
                  style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}
                >
                  {item.text_feedback}
                </p>
                <p
                  className="text-xs mt-2"
                  style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}
                >
                  {new Date(item.created_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

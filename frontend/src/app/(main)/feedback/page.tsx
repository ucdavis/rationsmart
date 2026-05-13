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
  size = 32,
}: {
  rating: number;
  onChange?: (r: number) => void;
  readOnly?: boolean;
  size?: number;
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
            size={size}
            filled={star <= (hovered || rating)}
            color={star <= (hovered || rating) ? "#E3B505" : "#C2C2C2"}
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
    // Match Android FeedbackRepository.fetchFeedbacks() which passes
    // limit=5 / offset=0 (FeedbackRepository.kt:13-15). The count badge
    // shows the returned array size, so PWA must request the same page
    // size — otherwise we'd show "11 TOTAL" while Android shows "5".
    getMyFeedback(user.id, 5, 0)
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

  const canSubmit = text.trim().length > 0 || rating > 0;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <Toolbar type="back" title="Feedback" onBack={() => router.back()} />

      <div className="flex-1 overflow-y-auto pb-8">
        {/* Rating title */}
        <p
          className="text-center font-bold mt-5"
          style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 18 }}
        >
          Rate The App
        </p>

        {/* Stars */}
        <div className="flex justify-center mt-2.5">
          <StarRating rating={rating} onChange={setRating} />
        </div>

        {/* Category label */}
        <p
          className="font-bold mt-5 ml-3"
          style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14 }}
        >
          Feedback Category
        </p>

        {/* Category radio buttons */}
        <div className="flex gap-6 ml-3 mt-1.5">
          {CATEGORIES.map((c) => (
            <label
              key={c}
              className="flex items-center gap-1.5"
              style={{ cursor: "pointer" }}
            >
              <input
                type="radio"
                name="feedback-category"
                value={c}
                checked={category === c}
                onChange={() => setCategory(c)}
                style={{ accentColor: "#064E3B", width: 18, height: 18, cursor: "pointer" }}
              />
              <span style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 14 }}>{c}</span>
            </label>
          ))}
        </div>

        {/* Textarea */}
        <div className="mx-3 mt-2.5">
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Tell us how we can improve..."
            className="w-full px-3 py-3 text-base focus:outline-none resize-none"
            style={{
              backgroundColor: "#F1F5F9",
              color: "#231F20",
              fontFamily: "Nunito, sans-serif",
              borderRadius: 18,
              border: "1px solid #E2E8F0",
              minHeight: 140,
            }}
          />
          <p
            className="text-xs text-right mt-1"
            style={{ color: "#999999", fontFamily: "Nunito, sans-serif" }}
          >
            {text.length} / 1000
          </p>
        </div>

        {/* Submit button */}
        <div className="mx-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full py-4 font-bold text-base flex items-center justify-center gap-2"
            style={{
              backgroundColor: canSubmit && !isSubmitting ? "#064E3B" : "#D3D3D3",
              color: canSubmit && !isSubmitting ? "#FFFFFF" : "#999999",
              border: "none",
              borderRadius: 14,
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
            ) : (
              <>
                Submit Feedback
                {/* ic_submit_feedback — Material Symbols "send" (paper plane),
                    iconGravity=textEnd. Single filled path tinted with
                    currentColor so it matches the button's text color. */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.4,20.4l17.45,-7.48c0.81,-0.35 0.81,-1.49 0,-1.84L3.4,3.6c-0.66,-0.29 -1.39,0.2 -1.39,0.91L2,9.12c0,0.5 0.37,0.93 0.87,0.99L17,12 2.87,13.88c-0.5,0.07 -0.87,0.5 -0.87,1l0.01,4.61c0,0.71 0.73,1.2 1.39,0.91z" />
                </svg>
              </>
            )}
          </button>
        </div>

        {/* My Feedback History */}
        <div className="mx-3 mt-5">
          <div className="flex items-center justify-between mb-3">
            <p
              className="font-bold"
              style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 14 }}
            >
              Your Feedbacks
            </p>
            <span
              style={{
                backgroundColor: "#F0FDF4",
                color: "#064E3B",
                fontFamily: "Nunito, sans-serif",
                fontSize: 12,
                paddingLeft: 10,
                paddingRight: 10,
                paddingTop: 2,
                paddingBottom: 2,
                borderRadius: 50,
              }}
            >
              {history.length} TOTAL
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
                className="rounded-2xl bg-white mb-2.5 px-3 pt-5 pb-5"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
              >
                {/* Row 1: Stars (left) + Date (right) */}
                <div className="flex items-center justify-between mb-3">
                  <StarRating rating={item.overall_rating} readOnly size={24} />
                  <span
                    className="font-bold"
                    style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}
                  >
                    {new Date(item.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {/* Row 2: Category badge */}
                <div className="mb-2.5">
                  <span style={categoryBadgeStyle(item.feedback_type)}>{item.feedback_type?.toUpperCase()}</span>
                </div>
                {/* Row 3: Feedback text */}
                <p
                  className="text-sm"
                  style={{
                    color: "#231F20",
                    fontFamily: "Nunito, sans-serif",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  } as React.CSSProperties}
                >
                  {item.text_feedback}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

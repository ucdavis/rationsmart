"use client";

// N11: small pieces shared by the three help screens.
import { COLORS } from "@/lib/colors";
import { errorStatus } from "@/lib/errors";
import { formatVideoLength } from "@/lib/help";
import type { HelpTopicSummary } from "@/lib/api";

export const NOT_IN_LANGUAGE = "This help is not yet in your language.";
export const HELP_OFFLINE = "Help needs internet.";
export const HELP_UNAVAILABLE = "Help is not available right now.";

/** No HTTP status = the request never got an answer (offline, proxy down). */
export const helpErrorMessage = (err: unknown) =>
  errorStatus(err) === undefined ? HELP_OFFLINE : HELP_UNAVAILABLE;

export const helpCard: React.CSSProperties = {
  backgroundColor: COLORS.white,
  borderRadius: 12,
  boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
};

/** Help text is plain text (contract D5): `\n` is a line break, nothing is HTML. */
export const plainText: React.CSSProperties = { whiteSpace: "pre-line", overflowWrap: "anywhere" };

export function HelpNote({ text, tone = "info" }: { text: string; tone?: "info" | "error" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "note"}
      className="text-sm px-3 py-2 mb-3"
      style={{
        borderRadius: 10,
        backgroundColor: tone === "error" ? COLORS.peachyPink : COLORS.brightGrayNew,
        color: tone === "error" ? COLORS.raisinBlack : COLORS.darkAquamarineGreen,
      }}
    >
      {text}
    </p>
  );
}

export function VideoPill({ seconds }: { seconds: number | null }) {
  if (!seconds) return null;
  return (
    <span
      className="shrink-0 text-xs font-bold"
      style={{
        padding: "2px 8px",
        borderRadius: 10,
        backgroundColor: COLORS.goGreen15,
        color: COLORS.darkAquamarineGreen,
      }}
    >
      ▶ {formatVideoLength(seconds)}
    </span>
  );
}

export function TopicRow({ topic, onOpen }: { topic: HelpTopicSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-start gap-3"
      style={{ background: "none", border: "none", cursor: "pointer", padding: "12px 16px" }}
    >
      <span
        className="shrink-0 flex items-center justify-center text-sm font-bold"
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: COLORS.honeydew,
          color: COLORS.darkAquamarineGreen,
        }}
      >
        {topic.number}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold" style={{ color: COLORS.raisinBlack, fontSize: 15 }}>
          {topic.title}
        </span>
        {topic.summary && (
          <span className="block text-sm mt-0.5" style={{ color: COLORS.darkSilver }}>
            {topic.summary}
          </span>
        )}
      </span>
      <VideoPill seconds={topic.video_seconds} />
    </button>
  );
}

export function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-bold"
      style={{
        padding: "6px 12px",
        borderRadius: 16,
        border: `1.5px solid ${COLORS.darkAquamarineGreen}`,
        backgroundColor: COLORS.white,
        color: COLORS.darkAquamarineGreen,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-bold mb-2 mt-5" style={{ color: COLORS.darkAquamarineGreen, fontSize: 16 }}>
      {children}
    </h2>
  );
}

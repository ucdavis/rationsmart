"use client";

// N11: our own poster with a ▶ button. Nothing is requested from YouTube
// until the user taps; then the no-cookie player replaces the poster and
// plays in place (contract §4). `start` is null while the poster shows.
import { COLORS } from "@/lib/colors";
import { helpMediaUrl, type HelpVideo } from "@/lib/api";
import { formatVideoLength } from "@/lib/help";

export interface VideoFacadeProps {
  video: HelpVideo;
  title: string;
  lang: string;
  start: number | null;
  onPlay: (start: number) => void;
  t: (source: string) => string;
}

export function youtubeEmbedUrl(youtubeId: string, start: number, lang: string): string {
  const params = new URLSearchParams({
    start: String(Math.max(0, Math.floor(start))),
    rel: "0",
    autoplay: "1",
    cc_load_policy: "1",
    cc_lang_pref: lang,
    hl: lang,
  });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?${params.toString()}`;
}

export default function VideoFacade({ video, title, lang, start, onPlay, t }: VideoFacadeProps) {
  const frame: React.CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 9",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.darkAquamarineGreen,
  };

  if (start !== null) {
    return (
      <div style={frame}>
        <iframe
          // A new start (a "watch this step" tap) reloads the player there.
          key={start}
          src={youtubeEmbedUrl(video.youtube_id, start, lang)}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    );
  }

  const poster = helpMediaUrl(video.poster);
  return (
    <button
      type="button"
      onClick={() => onPlay(0)}
      aria-label={t("Play video")}
      style={{ ...frame, display: "block", border: "none", padding: 0, cursor: "pointer" }}
    >
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element -- backend image via the proxy; next/image adds nothing here (unoptimized)
        <img
          src={poster}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      <span
        className="flex items-center justify-center"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: "rgba(0,0,0,0.55)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill={COLORS.white} />
        </svg>
      </span>
      {video.seconds > 0 && (
        <span
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            padding: "2px 8px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            color: COLORS.white,
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          {formatVideoLength(video.seconds)}
        </span>
      )}
    </button>
  );
}

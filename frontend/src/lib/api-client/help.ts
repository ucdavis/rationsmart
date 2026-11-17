// In-app help (N11): topics, the screen → topic map, FAQs and help images.
// Contract: backend docs/dev_docs/in_app_help/v1_Help_API_Contract.md (v1 rev 3).
// Public endpoints — no login. Import from "@/lib/api".

import { api } from "./client";
import { asRecord, listFrom, numberField, stringField } from "./normalize";

export type HelpAudience = "all" | "farmers" | "advanced" | "nutritionists";

export interface HelpTopicSummary {
  key: string;
  number: number;
  title: string;
  summary: string;
  audience: HelpAudience | null;
  video_seconds: number | null;
}

export interface HelpScreen {
  topic: string;
  related: string[];
}

export interface HelpFaq {
  question: string;
  answer: string;
  topic: string | null;
}

export interface HelpIndex {
  content_version: string;
  language: string;
  fallback: boolean;
  quick_start: string;
  topics: HelpTopicSummary[];
  screens: Record<string, HelpScreen>;
  faqs: HelpFaq[];
}

export interface HelpVideo {
  youtube_id: string;
  seconds: number;
  poster: string | null;
  chapters: { start: number; label: string }[];
}

export interface HelpStep {
  text: string;
  image: string | null;
  video_start: number | null;
}

export interface HelpTopic {
  key: string;
  number: number;
  language: string;
  fallback: boolean;
  title: string;
  summary: string;
  screen_label: string;
  video: HelpVideo | null;
  steps: HelpStep[];
  problems: { title: string; text: string }[];
  related: string[];
  next: string | null;
  updated: string;
}

const AUDIENCES: readonly string[] = ["all", "farmers", "advanced", "nutritionists"];
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TOPIC_KEY = /^[a-z0-9-]{1,40}$/;

const str = (x: unknown, key: string) => stringField(x, key) ?? "";
const strOrNull = (x: unknown, key: string) => stringField(x, key) ?? null;
const numOrNull = (x: unknown, key: string) => numberField(x, key) ?? null;
const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];

function parseSummary(x: unknown): HelpTopicSummary {
  const audience = stringField(x, "audience");
  return {
    key: str(x, "key"),
    number: numberField(x, "number") ?? 0,
    title: str(x, "title"),
    summary: str(x, "summary"),
    audience: audience && AUDIENCES.includes(audience) ? (audience as HelpAudience) : null,
    video_seconds: numOrNull(x, "video_seconds"),
  };
}

export function parseHelpIndex(data: unknown): HelpIndex {
  const screens: Record<string, HelpScreen> = {};
  for (const [key, value] of Object.entries(asRecord(asRecord(data)?.screens) ?? {})) {
    const topic = stringField(value, "topic");
    if (topic) screens[key] = { topic, related: strings(asRecord(value)?.related) };
  }
  return {
    content_version: str(data, "content_version"),
    language: stringField(data, "language") ?? "en",
    fallback: asRecord(data)?.fallback === true,
    quick_start: str(data, "quick_start"),
    topics: listFrom<unknown>(data, "topics")
      .map(parseSummary)
      .filter((t) => t.key !== "")
      .sort((a, b) => a.number - b.number),
    screens,
    faqs: listFrom<unknown>(data, "faqs").map((f) => ({
      question: str(f, "question"),
      answer: str(f, "answer"),
      topic: strOrNull(f, "topic"),
    })),
  };
}

function parseVideo(x: unknown): HelpVideo | null {
  const youtube_id = stringField(x, "youtube_id");
  // Anything but a real video id would end up in the iframe URL.
  if (!youtube_id || !YOUTUBE_ID.test(youtube_id)) return null;
  return {
    youtube_id,
    seconds: numberField(x, "seconds") ?? 0,
    poster: strOrNull(x, "poster"),
    chapters: listFrom<unknown>(asRecord(x)?.chapters).map((c) => ({
      start: numberField(c, "start") ?? 0,
      label: str(c, "label"),
    })),
  };
}

export function parseHelpTopic(data: unknown): HelpTopic {
  const o = asRecord(data);
  return {
    key: str(data, "key"),
    number: numberField(data, "number") ?? 0,
    language: stringField(data, "language") ?? "en",
    fallback: o?.fallback === true,
    title: str(data, "title"),
    summary: str(data, "summary"),
    screen_label: str(data, "screen_label"),
    video: parseVideo(o?.video),
    steps: listFrom<unknown>(data, "steps").map((s) => ({
      text: str(s, "text"),
      image: strOrNull(s, "image"),
      video_start: numOrNull(s, "video_start"),
    })),
    problems: listFrom<unknown>(data, "problems").map((p) => ({
      title: str(p, "title"),
      text: str(p, "text"),
    })),
    related: strings(o?.related),
    next: strOrNull(data, "next"),
    updated: str(data, "updated"),
  };
}

// The index is small and changes only with a backend deploy: fetch it once
// per language per session (memory only — /api/proxy stays NetworkOnly in the
// service worker). A failed fetch is not kept, so the next open retries.
const indexCache = new Map<string, Promise<HelpIndex>>();

export const getHelpIndex = (lang: string): Promise<HelpIndex> => {
  const cached = indexCache.get(lang);
  if (cached) return cached;
  const request = api
    .get("/v1/help/index", { params: { lang } })
    .then((res) => parseHelpIndex(res.data));
  indexCache.set(lang, request);
  void request.catch(() => indexCache.delete(lang));
  return request;
};

/** Test hook: forget the cached indexes. */
export const clearHelpIndexCache = () => indexCache.clear();

export const getHelpTopic = async (key: string, lang: string): Promise<HelpTopic> => {
  // The backend answers 404 for a malformed key anyway; don't build a path from it.
  if (!TOPIC_KEY.test(key)) {
    throw Object.assign(new Error("Help topic not found"), { status: 404 });
  }
  const res = await api.get(`/v1/help/topics/${key}`, { params: { lang } });
  return parseHelpTopic(res.data);
};

/** Same-origin URL for a help image path from the JSON; null for anything else. */
export function helpMediaUrl(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/v1/help/media/") || path.includes("..")) return null;
  return `/api/proxy${path}`;
}

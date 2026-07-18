/**
 * Script Writer Types
 * ===================
 * أنواع البيانات لأداة كتابة السكريبت.
 */

export type ContentType = "youtube" | "reel" | "tiktok" | "podcast" | "blog";
export type Tone = "professional" | "casual" | "energetic" | "educational" | "dramatic";
export type Language = "ar" | "en";

export interface ScriptWriterRequest {
  topic: string;
  contentType: ContentType;
  audience?: string;
  tone?: Tone;
  language?: Language;
  durationSeconds?: number;
  cta?: string;
  enableThinking?: boolean;
  messages?: { role: "user" | "assistant"; content: string }[];
}

export interface ScriptSegment {
  section: "hook" | "intro" | "body" | "cta" | "open_loop_resolution" | "outro";
  label: string;
  content: string;
  techniques: string[];
  durationSeconds?: number;
}

export interface ScriptResult {
  contentType: ContentType;
  topic: string;
  language: Language;
  segments: ScriptSegment[];
  openLoops: { openedAt: string; resolvedAt: string }[];
  emotionalArc: string[];
  skillsUsed: string[];
  markdown: string;
}

export interface ScriptSSEEvent {
  type:
    | "status"
    | "token"
    | "thinking"
    | "script_done"
    | "done"
    | "error";
  content?: string;
  message?: string;
  script?: ScriptResult;
  error?: string;
}

export const CONTENT_TYPE_LABELS: Record<ContentType, { ar: string; en: string }> = {
  youtube: { ar: "يوتيوب (فيديو طويل)", en: "YouTube long-form" },
  reel: { ar: "ريلز / شورت", en: "Reel / Short" },
  tiktok: { ar: "تيك توك", en: "TikTok" },
  podcast: { ar: "بودكاست", en: "Podcast" },
  blog: { ar: "مقال / blog", en: "Blog post" },
};

export const TONE_LABELS: Record<Tone, { ar: string; en: string }> = {
  professional: { ar: "احترافي", en: "Professional" },
  casual: { ar: "ودود وعادي", en: "Casual" },
  energetic: { ar: "حماسي", en: "Energetic" },
  educational: { ar: "تعليمي", en: "Educational" },
  dramatic: { ar: "درامي", en: "Dramatic" },
};

/**
 * Content Studio Types
 * ===================
 * أنواع البيانات لأداة استوديو إنشاء المحتوى المتكاملة.
 */

export type ContentType = "youtube" | "reel" | "tiktok" | "podcast" | "blog" | "twitter-thread";
export type Platform = "youtube" | "instagram" | "tiktok" | "twitter" | "facebook" | "linkedin";
export type Tone = "professional" | "casual" | "energetic" | "educational" | "dramatic" | "humorous";
export type Language = "ar" | "en";

export interface ContentStudioRequest {
  topic: string;
  contentType: ContentType;
  platforms?: Platform[];
  tone?: Tone;
  language?: Language;
  audience?: string;
  enableThinking?: boolean;
  /** لو true، بيوّلد content calendar أسبوعي كمان */
  generateCalendar?: boolean;
}

export interface ContentIdea {
  title: string;
  angle: string;
  hook: string;
  reasonWhy: string;
}

export interface ThumbnailConcept {
  prompt: string;
  description: string;
  textOverlay: string;
  colorScheme: string;
}

export interface CaptionSet {
  platform: Platform;
  caption: string;
  hashtags: string[];
  bestPostingTime: string;
  cta: string;
}

export interface ContentCalendarItem {
  day: string;
  platform: Platform;
  contentType: ContentType;
  topic: string;
  hook: string;
}

export interface ContentStudioResult {
  topic: string;
  contentType: ContentType;
  language: Language;
  ideas: ContentIdea[];
  thumbnailConcept?: ThumbnailConcept;
  captions: CaptionSet[];
  calendar?: ContentCalendarItem[];
  strategyNotes: string;
  skillsUsed: string[];
  markdown: string;
}

export interface ContentStudioSSEEvent {
  type: "status" | "token" | "thinking" | "studio_done" | "done" | "error";
  content?: string;
  message?: string;
  result?: ContentStudioResult;
  error?: string;
}

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  youtube: "يوتيوب (فيديو طويل)",
  reel: "ريلز / شورت",
  tiktok: "تيك توك",
  podcast: "بودكاست",
  blog: "مقال / blog",
  "twitter-thread": "ثريد تويتر",
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "يوتيوب",
  instagram: "إنستجرام",
  tiktok: "تيك توك",
  twitter: "تويتر",
  facebook: "فيسبوك",
  linkedin: "لينكدإن",
};

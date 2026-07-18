/**
 * MCP Tool: Emoji Info
 * بيرجّع معلومات عن أي emoji (اسم، كود، keywords، مجموعة).
 * بيدعم الإدخال بـ emoji مباشر أو اسم.
 */
import type { MCPTool } from "../types";

// قاعدة بيانات محلية للأكثر شيوعاً
const EMOJI_DB: Record<string, any> = {
  "😀": { name: "grinning face", group: "Smileys & Emotion", keywords: ["smile", "happy", "joy"] },
  "😂": { name: "face with tears of joy", group: "Smileys & Emotion", keywords: ["laugh", "cry", "funny"] },
  "❤️": { name: "red heart", group: "Smileys & Emotion", keywords: ["love", "heart", "romance"] },
  "👍": { name: "thumbs up", group: "People & Body", keywords: ["like", "ok", "good"] },
  "👎": { name: "thumbs down", group: "People & Body", keywords: ["dislike", "no", "bad"] },
  "🔥": { name: "fire", group: "Animals & Nature", keywords: ["hot", "lit", "trend"] },
  "🎉": { name: "party popper", group: "Activities", keywords: ["party", "celebrate", "fun"] },
  "💯": { name: "hundred points", group: "Smileys & Emotion", keywords: ["100", "perfect", "score"] },
  "🚀": { name: "rocket", group: "Travel & Places", keywords: ["launch", "space", "fast"] },
  "⭐": { name: "star", group: "Symbols", keywords: ["rating", "favorite", "review"] },
  "✅": { name: "check mark button", group: "Symbols", keywords: ["ok", "done", "complete"] },
  "❌": { name: "cross mark", group: "Symbols", keywords: ["no", "wrong", "cancel"] },
  "⚠️": { name: "warning", group: "Symbols", keywords: ["alert", "caution", "danger"] },
  "💡": { name: "light bulb", group: "Objects", keywords: ["idea", "tip", "bright"] },
  "🎯": { name: "bullseye", group: "Activities", keywords: ["target", "goal", "focus"] },
  "📞": { name: "telephone", group: "Objects", keywords: ["call", "phone", "contact"] },
  "📧": { name: "email", group: "Objects", keywords: ["mail", "message", "inbox"] },
  "💰": { name: "money bag", group: "Objects", keywords: ["money", "cash", "rich"] },
  "🏆": { name: "trophy", group: "Activities", keywords: ["win", "award", "champion"] },
  "🔒": { name: "locked", group: "Objects", keywords: ["secure", "lock", "private"] },
};

export const emojiInfoTool: MCPTool = {
  name: "emoji_info",
  description: "معلومات عن أي emoji (اسم، كود، keywords). استخدمها لما المستخدم يقول 'emoji' أو 'إيموجي' أو 'رمز تعبيري'.",
  parameters: {
    type: "object",
    properties: {
      emoji: { type: "string", description: "الـ emoji نفسه أو اسمه (مثلاً: 🔥 أو fire)" },
    },
    required: ["emoji"],
  },
  async execute(params) {
    const input = String(params.emoji || "").trim();
    if (!input) return { success: false, error: "emoji مطلوب" };

    try {
      // لو الـ input هو emoji مباشر
      let emoji = "";
      let info: any = null;

      // استخرج الـ emoji من النص (لو فيه حروف)
      const emojiMatch = input.match(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/u);
      if (emojiMatch) {
        emoji = emojiMatch[0];
        info = EMOJI_DB[emoji];
      } else {
        // لو الـ input هو اسم، ابحث في الـ DB
        const lowerInput = input.toLowerCase();
        for (const [em, data] of Object.entries(EMOJI_DB)) {
          if (data.name === lowerInput || data.keywords.some((k: string) => k === lowerInput)) {
            emoji = em;
            info = data;
            break;
          }
        }
      }

      if (!emoji) {
        return { success: false, error: `Emoji "${input}" مش موجود في قاعدة البيانات` };
      }

      // Unicode code points
      const codePoints: string[] = [];
      for (const ch of emoji) {
        const cp = ch.codePointAt(0);
        if (cp) codePoints.push(`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
      }

      // HTML entity
      const htmlEntity = `&#${emoji.codePointAt(0)};`;

      // URL encoded
      const urlEncoded = encodeURIComponent(emoji);

      return {
        success: true,
        data: {
          emoji,
          name: info?.name || "(unknown)",
          group: info?.group || "Unknown",
          keywords: info?.keywords || [],
          unicode: codePoints.join(" "),
          html_entity: htmlEntity,
          url_encoded: urlEncoded,
          shortcodes: [info?.name ? `:${info.name.replace(/\s+/g, "_")}:` : ""],
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

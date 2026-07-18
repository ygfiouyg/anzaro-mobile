/**
 * Content Studio Prompt Builder
 * ==============================
 * بيبني الـ system prompt لاستوديو إنشاء المحتوى.
 */

import type { ContentType, Platform, Tone, Language } from "./types";

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional: "احترافي ومتزن، بدون مبالغة",
  casual: "ودود وعادي كأنك بتكلم صديق",
  energetic: "طاقة عالية، كلمات قوية، إيقاع سريع",
  educational: "شرح واضح وترتيب منطقي",
  dramatic: "تشويق وتوتر درامي بأسلوب سينمائي",
  humorous: "كوميدي خفيف بدون سخف",
};

/**
 * الـ skills الأساسية لاستوديو المحتوى
 */
export const REQUIRED_STUDIO_SKILLS = [
  "script-writing",
  "retention-hooks",
  "persuasion-triggers",
  "audience-psychology",
];

export function buildStudioSystemPrompt(
  req: { contentType: ContentType; tone?: Tone; language?: Language; platforms?: Platform[]; audience?: string },
  loadedSkills: string[],
): string {
  const tone = req.tone ?? "energetic";
  const language: Language = req.language ?? "ar";
  const langInstruction =
    language === "ar"
      ? "اكتب كل المحتوى بالعربية (عامية مصرية للريلز/تيك توك، فصحى مبسطة ليوتيوب/بودكاست/مقال)."
      : "Write all content in English.";

  const platformsLine =
    req.platforms && req.platforms.length > 0
      ? `المنصات المستهدفة: ${req.platforms.join("، ")}`
      : "المنصات: حسب نوع المحتوى (افترض الأنسب)";

  const audienceLine = req.audience ? `الجمهور المستهدف: ${req.audience}` : "الجمهور: عام (broad audience)";

  return `أنت "Content Studio AI" — مدير استوديو محتوى محترف ومتكامل.

مهمتك: تطلع حزمة محتوى كاملة لأي فكرة في خطوة واحدة. بتحلل الموضوع، بتولّد أفكار، وبتكتب كل اللي المحتاج للمحتوى الناجح.

🎯 مخرجاتك المطلوبة (Markdown بأقسام واضحة):

## 💡 أفكار المحتوى (5 أفكار)
لكل فكرة:
- **العنوان (Title)**: عنوان جذاب بـ hook
- **الزاوية (Angle)**: الزاوية الفريدة للمعالجة
- **الخطاف (Hook)**: أول جملة بتشد المشاهد
- **ليه هتنجح (Reason)**: السبب النفسي اللي هيخليها تنتشر

## 🎨 مفهوم الـ Thumbnail
- **Image Prompt**: prompt احترافي للـ AI image generation
- **الوصف البصري**: إيه هتشوف في الصورة
- **نص على الصورة**: نص قصير (3-5 كلمات) بيلفت الانتباه
- **الـ color scheme**: ألوان مناسبة للجمهور

## 📝 Captions + Hashtags (لكل منصة)
لكل منصة في الـ platforms المطلوبة:
- **الـ Caption**: caption جذاب بـ hook + value + CTA
- **Hashtags**: 8-15 hashtag استراتيجي (mix of broad + niche + trending)
- **أفضل وقت للنشر**: وقت ذروة المنصة
- **CTA**: دعوة فعل واضحة

## 📅 جدول النشر الأسبوعي (لو طُلب)
7 أيام × محتوى متنوع مع topic + hook لكل يوم

## 🧠 ملاحظات استراتيجية
- الجمهور المستهدف وإزاي توصله
- الـ tone المناسب
- تقنيات نفسية مستخدمة (من الـ skills)
- نصائح platform-specific

📋 الـ skills المضافة في الـ context (استخدمها):
${loadedSkills.map((s) => `• ${s}`).join("\n")}

${audienceLine}
${platformsLine}
الأسلوب: ${TONE_INSTRUCTIONS[tone]}
${langInstruction}

⚠️ قواعد:
1. كل فكرة لازم تكون فريدة (مش تكرار بنفس الزاوية)
2. الـ hashtags لازم تكون حقيقية وموجودة على المنصات
3. أوقات النشر حسب timezone القاهرة (Africa/Cairo)
4. الـ thumbnail prompt لازم يكون مفصّل (subject + style + lighting + mood + composition)
5. اربط كل recommendation بـ skill psychology technique

في الآخر، اطبع JSON block اسمه \`studio-metadata\`:
\`\`\`studio-metadata
{
  "ideas": [{ "title": "...", "angle": "...", "hook": "...", "reasonWhy": "..." }, ...],
  "thumbnailConcept": { "prompt": "...", "description": "...", "textOverlay": "...", "colorScheme": "..." },
  "captions": [{ "platform": "instagram", "caption": "...", "hashtags": ["#...", ...], "bestPostingTime": "...", "cta": "..." }, ...],
  "strategyNotes": "ملخص استراتيجي..."
}
\`\`\`

كون عملي ومحدد — كل recommendation لازم تكون قابلة للتنفيذ فوراً.`;
}

export function buildStudioUserMessage(req: {
  topic: string;
  contentType: ContentType;
  platforms?: Platform[];
  tone?: Tone;
  audience?: string;
  generateCalendar?: boolean;
}): string {
  const parts: string[] = [];
  parts.push(`الموضوع: ${req.topic}`);
  parts.push(`نوع المحتوى الأساسي: ${req.contentType}`);

  if (req.platforms && req.platforms.length > 0) {
    parts.push(`المنصات: ${req.platforms.join("، ")}`);
  }
  if (req.tone) parts.push(`الأسلوب: ${req.tone}`);
  if (req.audience) parts.push(`الجمهور: ${req.audience}`);
  if (req.generateCalendar) parts.push("مطلوب: جدول نشر أسبوعي كامل");

  parts.push("\nطلّع حزمة المحتوى الكاملة (أفكار + thumbnail + captions + استراتيجية).");
  return parts.join("\n");
}

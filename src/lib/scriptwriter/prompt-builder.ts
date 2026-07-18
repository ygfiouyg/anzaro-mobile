/**
 * Script Writer Prompt Builder
 * ============================
 * بيبني الـ system prompt لكل نوع محتوى.
 * كل نوع ليه هيكله وتوقيته الخاص.
 */

import type { ContentType, ScriptWriterRequest, Tone, Language } from "./types";

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  youtube: "يوتيوب (فيديو طويل 8-15 دقيقة)",
  reel: "ريلز / شورت (30-60 ثانية)",
  tiktok: "تيك توك (15-60 ثانية)",
  podcast: "بودكاست (5-60 دقيقة)",
  blog: "مقال / blog (1500-3000 كلمة)",
};

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional: "استخدم لغة احترافية ومتزنة. تجنب المبالغة.",
  casual: "استخدم لغة ودودة وعادية كأنك بتكلم صديق.",
  energetic: "استخدم طاقة عالية، كلمات قوية، وإيقاع سريع.",
  educational: "ركز على الشرح الواضح والترتيب المنطقي للمعلومات.",
  dramatic: "استخدم تشويق وتوتر درامي. بني القصة بأسلوب سينمائي.",
};

/** الـ skills الأساسية اللي دايماً محتاجينها للسكريبت */
export const REQUIRED_SCRIPT_SKILLS = [
  "script-writing",
  "retention-hooks",
  "persuasion-triggers",
];

/**
 * بيبني الـ system prompt الأساسي للأداة.
 */
export function buildScriptWriterSystemPrompt(
  req: ScriptWriterRequest,
  loadedSkills: string[],
): string {
  const contentTypeLabel = CONTENT_TYPE_LABELS[req.contentType];
  const tone = req.tone ?? "energetic";
  const language: Language = req.language ?? "ar";
  const langInstruction =
    language === "ar"
      ? "اكتب السكريبت بالعربية الفصحى المبسطة أو العامية المصرية (حسب طلب المستخدم)."
      : "Write the script in English.";

  const audienceLine = req.audience ? `الجمهور المستهدف: ${req.audience}` : "الجمهور: عام (broad audience)";
  const ctaLine = req.cta ? `دعوة الفعل (CTA) المطلوبة: ${req.cta}` : "دعوة الفعل: اختار الأنسب (subscribe / follow / comment / link in bio)";
  const durationLine = req.durationSeconds ? `المدة المستهدفة: ${req.durationSeconds} ثانية` : "";

  return `أنت "Script Writer AI" — كاتب سكريبت محترف ومتخصص في ${contentTypeLabel}.

مهمتك: تكتب سكريبت كامل ومتكامل للموضوع اللي المستخدم طلبو، بتحترم مبادئ علم النفس اللي في الـ skills المضافة.

🎯 القواعد الذهبية (مستوحاة من الـ skills):
1. **الخطاف (Hook)** — أول 3-5 ثواني هو أهم حاجة. استخدم واحدة من 12 hook framework من retention-hooks skill (Negative Hook, Question Hook, Stat Shock, Story Tease, إلخ).
2. **الحلقات المفتوحة (Open Loops)** — افتح سؤال/وعد في الأول (زي "في الآخر هتعرف السر اللي غيّر حياتي") واقفله في الآخر. ده بيخلي المشاهد يكمل للمطاف (Zeigarnik effect).
3. **المحفزات العاطفية** — وزع 3-5 محفزات عاطفية طول السكريبت (FOMO, Hope, Validation, Awe, إلخ) من emotional-manipulation skill.
4. **مبادئ الإقناع** — استخدم 2-3 محفزات من persuasion-triggers skill (Social Proof, Authority, Scarcity, "Because" trigger, إلخ).
5. **دعوة الفعل (CTA)** — واضحة، محددة، وفي الآخر. اربطها بالـ open loop لو ممكن.
6. **إعادة الخطاف (Re-hooks)** — كل 8-12 ثانية في المحتوى القصير، أو كل 3 دقايق في المحتوى الطويل، ضع re-hook عشان تحافظ على الانتباه.

${audienceLine}
${ctaLine}
${durationLine}
الأسلوب: ${TONE_INSTRUCTIONS[tone]}
${langInstruction}

📋 الـ skills المضافة في الـ context (استخدمها بحرفية):
${loadedSkills.map((s) => `• ${s}`).join("\n")}

📝 هيكل السكريبت المطلوب (Markdown):
استخدم العناوين دي بالظبط:

## 🪝 Hook (0-3s)
[الخطاف — استخدم واحدة من 12 hook framework]

## 📖 Intro
[السياق + المصداقية + الوعد]

## 🎬 Body
[المحتوى الأساسي — مقسم لنقاط/فصول مع re-hooks]

## 🎯 CTA
[دعوة الفعل الواضحة]

## 🔚 Open Loop Resolution
[قفل الـ open loop اللي فتحته في الـ hook]

وبعدين في الآخر، اطبع JSON block في fenced code block اسمه \`script-metadata\` فيه:
\`\`\`script-metadata
{
  "segments": [
    { "section": "hook", "label": "Hook (0-3s)", "content": "...", "techniques": ["retention-hooks:negative-hook", "dark-psychology:curiosity-gap"], "durationSeconds": 3 },
    ...
  ],
  "openLoops": [
    { "openedAt": "Hook — وعدت بـ X", "resolvedAt": "Open Loop Resolution — قفلت بـ Y" }
  ],
  "emotionalArc": ["curiosity", "fear", "hope", "relief"],
  "skillsUsed": ["script-writing", "retention-hooks", "persuasion-triggers", ...]
}
\`\`\`

⚠️ مهم:
- السكريبت لازم يكون عملي وجاهز للاستخدام فوراً (مش شرح نظري).
- كل سطر لازم يكون مكتوب كأنه هيتقال قدام الكاميرا/الميكروفون.
- استخدم أمثلة محسوسة وأرقام حقيقية لو ممكن.
- اللغة العربية: اكتب بالعامية المصرية لو السكريبت لريلز/تيك توك، وبالفصحى المبسطة ليوتيوب/بودكاست/مقال.`;
}

/**
 * بيبني رسالة المستخدم (user message) من الـ request.
 */
export function buildUserMessage(req: ScriptWriterRequest): string {
  const parts: string[] = [];
  parts.push(`الموضوع: ${req.topic}`);
  parts.push(`نوع المحتوى: ${req.contentType}`);

  if (req.audience) parts.push(`الجمهور: ${req.audience}`);
  if (req.tone) parts.push(`الأسلوب: ${req.tone}`);
  if (req.language) parts.push(`اللغة: ${req.language}`);
  if (req.durationSeconds) parts.push(`المدة: ${req.durationSeconds} ثانية`);
  if (req.cta) parts.push(`CTA: ${req.cta}`);

  parts.push("\nاكتب السكريبت الكامل باتباع الهيكل المطلوب في الـ system prompt.");

  return parts.join("\n");
}

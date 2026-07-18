/**
 * POST /api/agents/generate-prompt
 * ================================
 * بياخد وصف نصي للوكيل المطلوب، ويرجّع system prompt جاهز + اقتراح أدوات.
 *
 * Body:
 *   { "description": string }  // وصف ما يقدرش يفكر فيه المستخدم
 *
 * Response:
 *   {
 *     "systemPrompt": string,
 *     "suggestedTools": string[],
 *     "suggestions": string[]  // example prompts for the agent
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { AGENT_TOOL_CATALOG } from "@/lib/agents/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AVAILABLE_TOOLS = AGENT_TOOL_CATALOG.map((t) => `- ${t.name}: ${t.description}`).join("\n");

const GENERATOR_PROMPT = `أنت خبير في تصميم وكلاء الذكاء الاصطناعي. مهمتك تكتب system prompt احترافي لوكيل بناءً على وصف المستخدم.

اتبع هذه القواعد:
1. الـ systemPrompt لازم يكون بالعربية، واضح ومنظّم، 200-400 كلمة.
2. ابدأ بـ: "أنت <اسم الوكيل> — <وصف قصير>."
3. اذكر المهارات/الأدوات اللي الوكيل بيستخدمها.
4. اذكر فلسفة العمل (4-6 نقاط مرقّمة).
5. اذكر أسلوب الردود.
6. لا تذكر أي أدوات مش موجودة في القائمة المتاحة.

الأدوات المتاحة:
${AVAILABLE_TOOLS}

رجّع JSON فقط بالصيغة دي:
{
  "systemPrompt": "...",
  "suggestedTools": ["tool1", "tool2", ...],
  "suggestions": ["مثال 1", "مثال 2", "مثال 3"]
}

مثال 3-5 اقتراحات للـ suggestions (أسئلة ممكن المستخدم يسألها للوكيل).
3-6 أدوات للـ suggestedTools.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const description = String(body.description || "").trim();

    if (!description) {
      return NextResponse.json(
        { error: "missing_description", message: "description مطلوبة" },
        { status: 400 },
      );
    }
    if (description.length < 10) {
      return NextResponse.json(
        { error: "too_short", message: "الوصف قصير جداً — اكتب على الأقل 10 أحرف" },
        { status: 400 },
      );
    }

    const zai = await ZAI.create();

    const completion: any = await zai.chat.completions.create({
      model: "glm-4.6-air",
      messages: [
        { role: "system", content: GENERATOR_PROMPT },
        { role: "user", content: `وصف الوكيل المطلوب:\n\n${description}` },
      ],
      temperature: 0.7,
    });

    // Extract content (handle both streaming and non-streaming)
    let content = "";
    const choice = completion?.choices?.[0];
    if (choice?.message?.content) {
      content = String(choice.message.content);
    } else if (completion?.message?.content) {
      content = String(completion.message.content);
    } else if (typeof completion === "string") {
      content = completion;
    }

    if (!content) {
      return NextResponse.json(
        { error: "empty_response", message: "GLM رجّع استجابة فارغة" },
        { status: 500 },
      );
    }

    // Extract JSON from content (might be wrapped in markdown fences)
    let parsed: any = null;
    let raw = content.trim();

    // Strip markdown fences
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      raw = fenceMatch[1].trim();
    }

    // Find the first { and last }
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      raw = raw.slice(first, last + 1);
    }

    try {
      parsed = JSON.parse(raw);
    } catch {
      // Return raw text if JSON parsing fails
      return NextResponse.json({
        systemPrompt: content,
        suggestedTools: [],
        suggestions: [],
        _warning: "Couldn't parse GLM response as JSON — returning raw text",
      });
    }

    // Validate suggestedTools exist
    const validToolNames = new Set(AGENT_TOOL_CATALOG.map((t) => t.name));
    const suggestedTools = Array.isArray(parsed.suggestedTools)
      ? parsed.suggestedTools.filter((t: unknown) => typeof t === "string" && validToolNames.has(t as string))
      : [];

    return NextResponse.json({
      systemPrompt: String(parsed.systemPrompt || content).trim(),
      suggestedTools,
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 6)
        : [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "generate_failed", message: e.message },
      { status: 500 },
    );
  }
}

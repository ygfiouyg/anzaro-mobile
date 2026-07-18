/**
 * MCP Tool: Calendar Assistant
 * سيناريو: إدارة مواعيد + جدولة + تذكيرات
 * n8n template: "AI Agent - Google calendar assistant using OpenAI"
 * 
 * الخطوات:
 * 1. حلل طلب المستخدم (ميعاد جديد، استعلام، إلغاء)
 * 2. ولّد رد منظم
 * 3. اقترح أوقات بديلة
 * 
 * ملاحظة: مفيش تكامل مباشر مع Google Calendar (محتاج OAuth).
 * الأداة بتحلل الطلب وتقترح المواعيد.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const calendarAssistantTool: MCPTool = {
  name: "calendar_assistant",
  description: "مساعد تقويم ذكي — جدولة + استعلام + اقتراح أوقات (سيناريو متكامل). استخدمها لما المستخدم يقول 'حدد ميعاد' أو 'calendar' أو 'مواعيدي'.",
  parameters: {
    type: "object",
    properties: {
      request: { type: "string", description: "طلب المستخدم (مثلاً: 'حدد اجتماع بكرة الصبح')" },
      action: { type: "string", description: "نوع: schedule, query, cancel, suggest (افتراضي: auto)", default: "auto" },
      duration: { type: "number", description: "المدة بالدقائق (افتراضي: 30)", default: 30 },
      timezone: { type: "string", description: "المنطقة الزمنية (افتراضي: Africa/Cairo)", default: "Africa/Cairo" },
    },
    required: ["request"],
  },
  async execute(params) {
    const request = String(params.request || "").trim();
    const action = String(params.action || "auto");
    const duration = Math.min(480, Math.max(15, Number(params.duration) || 30));
    const timezone = String(params.timezone || "Africa/Cairo");
    if (!request) return { success: false, error: "request مطلوب" };

    try {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 86400000);
      const nextWeek = new Date(now.getTime() + 7 * 86400000);

      // ═══ حلل الطلب + اقترح ═══
      const result = await callGLMForJSON({
        systemPrompt: `أنت مساعد تقويم ذكي. حلل الطلب ده:
"${request}"

التاريخ الحالي: ${now.toISOString().split("T")[0]} (${now.toLocaleDateString("ar-EG", { weekday: "long" })})
غداً: ${tomorrow.toISOString().split("T")[0]} (${tomorrow.toLocaleDateString("ar-EG", { weekday: "long" })})
المنطقة الزمنية: ${timezone}
مدة الحدث: ${duration} دقيقة

1. حدد نوع الطلب: schedule, query, cancel, suggest
2. استخرج: التاريخ، الوقت، المشاركين، الموضوع
3. اقترح 3 أوقات مناسبة (أوقات عمل 9ص-5م، تجنب الجمعة/السبت)
4. ولّد رد للمستخدم

رجّع JSON:
{
  "action": "schedule|query|cancel|suggest",
  "parsed": {
    "title": "عنوان الحدث",
    "date": "YYYY-MM-DD أو null",
    "time": "HH:MM أو null",
    "participants": [],
    "location": ""
  },
  "suggested_slots": [
    {"date":"","day":"","time":"","end_time":""}
  ],
  "response": "رد للمستخدم بالعربية"
}`,
        userMessage: request,
        maxTokens: 800,
        temperature: 0.4,
      });

      const parsed = result.data || {};

      // ═══ ولّد رابط تقويم لو فيه تاريخ ═══
      let calendarUrl = null;
      if (parsed.parsed?.date && parsed.parsed?.time) {
        try {
          const eventDate = new Date(parsed.parsed.date + "T" + parsed.parsed.time + ":00");
          const endDate = new Date(eventDate.getTime() + duration * 60000);
          const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
          calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(parsed.parsed.title || "Event")}&dates=${fmt(eventDate)}/${fmt(endDate)}&ctz=${timezone}`;
        } catch {}
      }

      return {
        success: true,
        data: {
          scenario: "calendar_assistant",
          request,
          action: parsed.action || action,
          timezone,
          current_date: now.toISOString().split("T")[0],
          steps: { parse: !!parsed.parsed, suggest: !!parsed.suggested_slots, respond: !!parsed.response },
          parsed: parsed.parsed || {},
          suggested_slots: parsed.suggested_slots || [],
          response: parsed.response || "",
          calendar_url: calendarUrl,
          note: "للتكامل المباشر مع Google Calendar، محتاج OAuth setup.",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};

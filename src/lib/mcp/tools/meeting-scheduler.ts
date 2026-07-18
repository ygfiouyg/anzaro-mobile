/**
 * MCP Tool: Meeting Scheduler
 * ===========================
 * سيناريو متكامل: "حدد اجتماع مع الفريق"
 *
 * الخطوات:
 * 1. حلل طلب الاجتماع (موضوع، المشاركين، المدة)
 * 2. اقترح أوقات مناسبة (بناءً على اليوم)
 * 3. ولّد دعوات الاجتماع
 * 4. اقترح تذكيرات
 *
 * مستوحى من n8n templates:
 * - AI Agent - Google calendar assistant using OpenAI
 * - AI Agent for realtime insights on meetings
 * - Actioning Your Meeting Next Steps using Transcripts and AI
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const meetingSchedulerTool: MCPTool = {
  name: "meeting_scheduler",
  description: "جدولة اجتماع ذكي — يحلل الطلب، يقترح أوقات، يولّد دعوات. استخدمها لما المستخدم يقول 'حدد اجتماع' أو 'اجتماع مع الفريق' أو 'schedule a meeting'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "موضوع الاجتماع" },
      participants: { type: "string", description: "أسماء المشاركين (مفصولة بفواصل)" },
      duration: { type: "number", description: "المدة بالدقائق (افتراضي: 30)", default: 30 },
      preferredDay: { type: "string", description: "يوم مفضل (اختياري: tomorrow, monday, specific date)" },
      preferredTime: { type: "string", description: "وقت مفضل (اختياري: morning, afternoon, evening)" },
      timezone: { type: "string", description: "المنطقة الزمنية (افتراضي: Africa/Cairo)", default: "Africa/Cairo" },
      agenda: { type: "string", description: "أجندة الاجتماع (اختياري)" },
    },
    required: ["topic", "participants"],
  },
  async execute(params) {
    const topic = String(params.topic || "").trim();
    const participants = String(params.participants || "").trim();
    const duration = Math.min(480, Math.max(15, Number(params.duration) || 30));
    const preferredDay = String(params.preferredDay || "tomorrow").toLowerCase();
    const preferredTime = String(params.preferredTime || "morning").toLowerCase();
    const timezone = String(params.timezone || "Africa/Cairo");
    const agenda = String(params.agenda || "").trim();

    if (!topic || !participants) return { success: false, error: "topic و participants مطلوبين" };

    try {
      const participantList = participants.split(/[,،]/).map((p) => p.trim()).filter(Boolean);

      // ═══ الخطوة 1: حدد التاريخ المناسب ═══
      const now = new Date();
      let meetingDate = new Date(now);

      if (preferredDay === "tomorrow") {
        meetingDate.setDate(meetingDate.getDate() + 1);
      } else if (preferredDay === "today") {
        // keep today
      } else if (preferredDay === "next_week") {
        meetingDate.setDate(meetingDate.getDate() + 7);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(preferredDay)) {
        meetingDate = new Date(preferredDay);
      } else {
        meetingDate.setDate(meetingDate.getDate() + 1);
      }

      // لو يوم الجمعة/السبت، اجلس للأحد
      const dayOfWeek = meetingDate.getDay();
      if (dayOfWeek === 5) { // Friday
        meetingDate.setDate(meetingDate.getDate() + 2);
      } else if (dayOfWeek === 6) { // Saturday
        meetingDate.setDate(meetingDate.getDate() + 1);
      }

      // ═══ الخطوة 2: اقترح أوقات ═══
      const timeSlots: Record<string, string[]> = {
        morning: ["09:00", "10:00", "11:00"],
        afternoon: ["13:00", "14:00", "15:00", "16:00"],
        evening: ["17:00", "18:00", "19:00"],
      };

      const slots = timeSlots[preferredTime] || timeSlots.morning;
      const endTime = new Date(meetingDate.getTime() + duration * 60000);

      const proposedSlots = slots.map((time) => {
        const [hours, minutes] = time.split(":").map(Number);
        const start = new Date(meetingDate);
        start.setHours(hours, minutes, 0, 0);
        const end = new Date(start.getTime() + duration * 60000);
        return {
          start: start.toISOString(),
          end: end.toISOString(),
          start_time: time,
          end_time: `${end.getHours().toString().padStart(2, "0")}:${end.getMinutes().toString().padStart(2, "0")}`,
          day: start.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" }),
        };
      });

      // ═══ الخطوة 3: ولّد دعوات ═══
      const invitation = await callGLMForJSON({
        systemPrompt: `أنت مساعد اجتماعات ذكي. ولّد دعوة اجتماع احترافية.

المعلومات:
- الموضوع: ${topic}
- المشاركون: ${participantList.join("، ")}
- المدة: ${duration} دقيقة
- الأجندة: ${agenda || "سيتم تحديدها"}

رجّع JSON:
{
  "email_subject": "عنوان دعوة الاجتماع",
  "email_body": "نص الدعوة (احترافي ومختصر)",
  "telegram_message": "رسالة قصيرة للتليجرام",
  "whatsapp_message": "رسالة قصيرة للواتساب",
  "agenda_items": ["بند 1", "بند 2", "بند 3"],
  "preparation_notes": "ملاحظات تحضير",
  "reminder_times": ["قبل يوم", "قبل ساعة", "قبل 15 دقيقة"]
}`,
        userMessage: `${topic} - ${participantList.join("، ")}`,
        maxTokens: 1000,
        temperature: 0.5,
      });

      const invite = invitation.data || {};

      // ═══ الخطوة 4: ولّد رابط تقويم ═══
      const startDate = proposedSlots[0]?.start || meetingDate.toISOString();
      const endDate = proposedSlots[0]?.end || endTime.toISOString();
      const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(topic)}&dates=${startDate.replace(/[-:]/g, "").split(".")[0]}/${endDate.replace(/[-:]/g, "").split(".")[0]}&details=${encodeURIComponent(agenda || invite.email_body || "")}&ctz=${timezone}`;

      return {
        success: true,
        data: {
          scenario: "meeting_scheduler",
          meeting: {
            topic,
            participants: participantList,
            duration_minutes: duration,
            date: meetingDate.toISOString().split("T")[0],
            day: meetingDate.toLocaleDateString("ar-EG", { weekday: "long" }),
            timezone,
          },
          proposed_slots: proposedSlots,
          best_slot: proposedSlots[0] || null,
          invitation: {
            email: {
              subject: invite.email_subject || `دعوة اجتماع: ${topic}`,
              body: invite.email_body || "",
            },
            telegram: invite.telegram_message || "",
            whatsapp: invite.whatsapp_message || "",
            agenda: invite.agenda_items || [],
            preparation: invite.preparation_notes || "",
            reminders: invite.reminder_times || ["قبل ساعة"],
          },
          calendar: {
            google_url: googleCalendarUrl,
            ical: `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${topic}\nDTSTART:${startDate}\nDTEND:${endDate}\nEND:VEVENT\nEND:VCALENDAR`,
          },
          steps_completed: {
            analyze_request: true,
            find_slots: true,
            generate_invitations: !!invite.email_body,
            create_calendar_link: true,
          },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

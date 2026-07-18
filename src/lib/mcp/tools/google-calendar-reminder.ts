/**
 * MCP Tool: Google Calendar Reminder
 * ===================================
 * Inserts a real event into the user's primary Google Calendar.
 *
 * Endpoint: POST https://www.googleapis.com/calendar/v3/calendars/primary/events
 * Scope:    https://www.googleapis.com/auth/calendar
 */

import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

interface CalendarEvent {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  summary?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string };
}

/** Validate + normalise an ISO datetime string. Returns null if invalid. */
function validateIso(value: string): string | null {
  const v = String(value || "").trim();
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  // Re-emit in full ISO 8601 with Z — Google Calendar requires this shape.
  return d.toISOString();
}

export const googleCalendarReminderTool: MCPTool = {
  name: "google_calendar_reminder",
  description:
    "ضيف reminder/event حقيقي في Google Calendar الرئيسي بتاع المستخدم. " +
    "استخدمها لما المستخدم يقول «ذكرني بكذا بكرة الساعة 3» أو «حدد موعد يوم كذا». " +
    "بتشتغل بـ OAuth access_token (calendar scope).",

  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "عنوان التذكير/الفعالية (مثال: 'اجتماع مع الفريق').",
      },
      description: {
        type: "string",
        description: "وصف/تفاصيل الفعالية (اختياري).",
      },
      startTime: {
        type: "string",
        description: "وقت بداية الفعالية بصيغة ISO 8601 (مثال: '2026-07-15T15:00:00').",
      },
      endTime: {
        type: "string",
        description: "وقت نهاية الفعالية بصيغة ISO 8601 (مثال: '2026-07-15T16:00:00'). لو مش متاح، هحسبه startTime + 30 دقيقة.",
      },
      timezone: {
        type: "string",
        description: "المنطقة الزمنية (افتراضي Africa/Cairo). مثال: 'America/New_York'.",
        default: "Africa/Cairo",
      },
      location: {
        type: "string",
        description: "مكان الفعالية (اختياري، مثال: 'مكتب القاهرة' أو رابط Meet).",
      },
      attendees: {
        type: "array",
        items: { type: "string" },
        description: "قائمة إيميلات المدعوين (اختياري — هيوصلكم دعوة).",
      },
      colorId: {
        type: "string",
        description: "لون الفعالية في التقويم (1-11). 1=لافندر، 2=نعناع، 3=بنفسجي، 4=وردي، 5=أصفر، 6=برتقالي، 7=سماوي، 8=رمادي، 9=أزرق، 10=أخضر، 11=أحمر.",
      },
      recurrence: {
        type: "string",
        description: "تكرار الفعالية بصيغة RRULE (اختياري). مثال: 'FREQ=WEEKLY' (أسبوعي)، 'FREQ=DAILY' (يومي)، 'FREQ=MONTHLY' (شهري).",
      },
      reminderMinutes: {
        type: "number",
        description: "كم دقيقة قبل الموعد تبعت الإشعار (افتراضي 10). مثال: 30 = نص ساعة قبل.",
        default: 10,
      },
    },
    required: ["summary", "startTime"],
  },

  async execute(params) {
    const summary = String(params.summary || "").trim();
    const description = String(params.description || "").trim();
    const timezone = String(params.timezone || "Africa/Cairo").trim();
    const location = String(params.location || "").trim();
    const colorId = String(params.colorId || "").trim();
    const recurrence = String(params.recurrence || "").trim();
    const reminderMinutes = Number(params.reminderMinutes) > 0 ? Number(params.reminderMinutes) : 10;
    const attendees = Array.isArray(params.attendees) ? params.attendees.map(a => String(a).trim()).filter(Boolean) : [];

    if (!summary) return { success: false, error: "لازم تدي summary للفعالية." };

    const startIso = validateIso(String(params.startTime));
    if (!startIso) {
      return { success: false, error: `startTime مش صيغة ISO صالحة: "${params.startTime}".` };
    }

    // endTime اختياري دلوقتي — لو مش متاح، نحسبه startTime + 30 دقيقة
    let endIso = validateIso(String(params.endTime));
    if (!endIso) {
      const endDate = new Date(startIso);
      endDate.setMinutes(endDate.getMinutes() + 30);
      endIso = endDate.toISOString();
    }
    if (new Date(endIso) <= new Date(startIso)) {
      return { success: false, error: "endTime لازم يكون بعد startTime." };
    }

    // ── Auth ──────────────────────────────────────────────────────────
    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };

    // ── Insert event into primary calendar ───────────────────────────
    const eventBody: Record<string, unknown> = {
      summary,
      description: description || undefined,
      start: { dateTime: startIso, timeZone: timezone },
      end: { dateTime: endIso, timeZone: timezone },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: reminderMinutes },
          { method: "email", minutes: Math.max(reminderMinutes, 30) },
        ],
      },
    };
    if (location) eventBody.location = location;
    if (colorId) eventBody.colorId = colorId;
    if (recurrence) eventBody.recurrence = [`RRULE:${recurrence}`];
    if (attendees.length > 0) {
      eventBody.attendees = attendees.map(email => ({ email }));
    }

    const resp = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      },
    );

    if (!resp.ok) {
      return { success: false, error: await formatGoogleError(resp, "calendar.events.insert") };
    }

    const event = (await resp.json()) as CalendarEvent;

    return {
      success: true,
      data: {
        event_id: event.id,
        summary,
        start: event.start?.dateTime ?? startIso,
        end: event.end?.dateTime ?? endIso,
        timezone,
        link: event.htmlLink ?? null,
        meet_link: event.hangoutLink ?? null,
        calendar: "primary",
        created_by: auth.user?.email ?? null,
      },
    };
  },
};

export default googleCalendarReminderTool;

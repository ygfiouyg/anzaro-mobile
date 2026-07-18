import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

interface CalendarEventRaw {
  id: string; summary?: string; description?: string; location?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  htmlLink?: string; hangoutLink?: string; attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
  status?: string; creator?: { email?: string; displayName?: string }; colorId?: string;
}
interface CalendarListResponse { items?: CalendarEventRaw[]; timeZone?: string; }
function validateIso(v: string): string | null { const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); }

export const googleCalendarListerTool: MCPTool = {
  name: "google_calendar_lister",
  description: "اقرا المواعيد/الأحداث القادمة من Google Calendar الرئيسي بتاع المستخدم (calendar scope). استخدمها لما المستخدم يقول 'شوفلي عندي ايه بكرة' أو 'فاضي امتى الأسبوع ده'.",
  parameters: { type: "object", properties: {
    startTime: { type: "string", description: "بداية ISO" },
    endTime: { type: "string", description: "نهاية ISO (افتراضي +7 أيام)" },
    max_results: { type: "number", description: "أقصى أحداث (افتراضي 25)" },
    search_query: { type: "string", description: "بحث في عنوان/وصف الحدث" },
    attendee_filter: { type: "string", description: "فلتر: بس الأحداث اللي شخص معين مدعو فيها (إيميل أو اسم)" },
    show_declined: { type: "boolean", description: "تعرض الأحداث المرفوضة؟ (افتراضي false)" },
    upcoming_only: { type: "boolean", description: "بس الأحداث اللي لسه مجتش؟ (افتراضي true)", default: true },
  }, required: [] },
  async execute(params) {
    const now = new Date();
    const upcomingOnly = params.upcoming_only !== false;
    const startIso = validateIso(String(params.startTime)) ?? (upcomingOnly ? now.toISOString() : new Date(now.getTime() - 7*24*60*60*1000).toISOString());
    const endIso = validateIso(String(params.endTime)) ?? new Date(now.getTime() + 7*24*60*60*1000).toISOString();
    const max = Number(params.max_results) > 0 ? Math.min(Number(params.max_results), 250) : 25;
    const showDeclined = params.show_declined === true;
    const attendeeFilter = String(params.attendee_filter || "").trim().toLowerCase();

    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", startIso); url.searchParams.set("timeMax", endIso);
    url.searchParams.set("maxResults", String(max)); url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime"); url.searchParams.set("timeZone", "Africa/Cairo");
    if (params.search_query) url.searchParams.set("q", String(params.search_query));
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
    if (!resp.ok) return { success: false, error: await formatGoogleError(resp, "calendar.events.list") };
    const data = (await resp.json()) as CalendarListResponse;

    let events = (data.items ?? []).map((e) => {
      const attendees = (e.attendees ?? []).map(a => ({ email: a.email ?? null, name: a.displayName ?? null, status: a.responseStatus ?? "unknown" }));
      return {
        id: e.id,
        title: e.summary ?? "(بدون عنوان)",
        start: e.start?.dateTime ?? e.start?.date ?? null,
        end: e.end?.dateTime ?? e.end?.date ?? null,
        location: e.location ?? null,
        description: e.description ? e.description.slice(0, 500) : null,
        link: e.htmlLink ?? null,
        meet_link: e.hangoutLink ?? null,
        attendees,
        attendees_count: attendees.length,
        creator: e.creator?.displayName ?? e.creator?.email ?? null,
        status: e.status ?? "confirmed",
        color_id: e.colorId ?? null,
      };
    });

    // ── Filter: hide declined events (unless show_declined=true) ──
    if (!showDeclined) {
      const userEmail = (auth.user?.email ?? "").toLowerCase();
      events = events.filter(e => {
        if (!e.attendees || e.attendees.length === 0) return true; // no attendees = not declined
        const myStatus = e.attendees.find(a => a.email?.toLowerCase() === userEmail);
        return myStatus?.status !== "declined";
      });
    }

    // ── Filter: by attendee ──
    if (attendeeFilter) {
      events = events.filter(e =>
        e.attendees.some(a =>
          (a.email?.toLowerCase().includes(attendeeFilter)) ||
          (a.name?.toLowerCase().includes(attendeeFilter))
        )
      );
    }

    const busyDays = new Set(events.filter(e => e.start).map(e => String(e.start).slice(0, 10)));

    // ── Quick summary stats ──
    const nowMs = Date.now();
    const upcomingCount = events.filter(e => e.start && new Date(e.start).getTime() > nowMs).length;
    const withMeetCount = events.filter(e => e.meet_link).length;
    const totalAttendees = events.reduce((sum, e) => sum + e.attendees_count, 0);

    return { success: true, data: {
      window: { start: startIso, end: endIso },
      total_events: events.length,
      upcoming_count: upcomingCount,
      events_with_meet: withMeetCount,
      total_attendees: totalAttendees,
      busy_days_count: busyDays.size,
      busy_days: Array.from(busyDays).sort(),
      events,
      hint: events.length === 0 ? "جدولك فاضي في النطاق ده." : `${upcomingCount} موعد قادم، ${busyDays.size} أيام مشغولة.`,
      searched_by: auth.user?.email ?? null,
    } };
  },
};
export default googleCalendarListerTool;

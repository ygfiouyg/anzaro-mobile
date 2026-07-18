/**
 * MCP Tool: Google Tasks Manager
 * ===============================
 * Creates a real task in the user's default Google Tasks list.
 *
 * Endpoint: POST https://tasks.googleapis.com/v1/lists/@default/tasks
 * Scope:    https://www.googleapis.com/auth/tasks
 */

import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

interface CreatedTask {
  id: string;
  title?: string;
  updated?: string;
  due?: string;
  status?: string;
  selfLink?: string;
}

/** Validate an ISO datetime string; return null if invalid. */
function validateIso(value: string): string | null {
  const v = String(value || "").trim();
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export const googleTasksManagerTool: MCPTool = {
  name: "google_tasks_manager",
  description:
    "ضيف مهمة (task) حقيقية في قائمة المهام الافتراضية بتاعة المستخدم في Google Tasks. " +
    "استخدمها لما المستخدم يقول «ضيف task: اشتري خضار» أو «خلّي عندي مهمة كذا قبل كذا». " +
    "بتشتغل بـ OAuth access_token (tasks scope).",

  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "عنوان المهمة (مثال: 'إنهاء التقرير').",
      },
      notes: {
        type: "string",
        description: "ملاحظات/تفاصيل إضافية للمهمة (اختياري).",
      },
      due: {
        type: "string",
        description: "موعد التسليم بصيغة ISO 8601 (اختياري، مثال: '2026-07-20T23:59:00').",
      },
      priority: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "أولوية المهمة (اختياري). high=عالية، medium=متوسطة، low=منخفضة.",
      },
      status: {
        type: "string",
        enum: ["needsAction", "completed"],
        description: "حالة المهمة (افتراضي needsAction). استخدم completed لو عاوز تأشرها كأنتهت.",
      },
    },
    required: ["title"],
  },

  async execute(params) {
    const title = String(params.title || "").trim();
    if (!title) {
      return { success: false, error: "لازم تدي title للمهمة." };
    }

    const notes = String(params.notes || "").trim();
    const dueRaw = String(params.due || "").trim();
    const due = dueRaw ? validateIso(dueRaw) : undefined;
    if (dueRaw && !due) {
      return { success: false, error: `due مش صيغة ISO صالحة: "${dueRaw}".` };
    }

    // ── Auth ──────────────────────────────────────────────────────────
    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };

    // ── Insert task into the default task list ───────────────────────
    const priority = String(params.priority || "").trim();
    const status = String(params.status || "needsAction").trim();
    const taskBody: Record<string, unknown> = { title, status };
    if (notes) taskBody.notes = notes;
    if (due) taskBody.due = due;
    // Google Tasks API priority: 1=high, 2=medium, 3=low
    if (priority === "high") taskBody.priority = "1";
    else if (priority === "medium") taskBody.priority = "2";
    else if (priority === "low") taskBody.priority = "3";

    const resp = await fetch("https://tasks.googleapis.com/v1/lists/@default/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(taskBody),
    });

    if (!resp.ok) {
      return { success: false, error: await formatGoogleError(resp, "tasks.insert") };
    }

    const task = (await resp.json()) as CreatedTask;

    return {
      success: true,
      data: {
        task_id: task.id,
        title,
        notes: notes || null,
        due: task.due ?? due ?? null,
        status: task.status ?? "needsAction",
        list: "@default",
        created_by: auth.user?.email ?? null,
        link: `https://tasks.google.com/tasks/?source=desktop&task=${task.id}`,
      },
    };
  },
};

export default googleTasksManagerTool;

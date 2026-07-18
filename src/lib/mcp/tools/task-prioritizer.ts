/**
 * MCP Tool: Task Prioritizer (Scenario)
 * سيناريو متعدد الخطوات: ترتيب المهام بالأولوية + تقدير وقت + توصية
 *
 * الخطوات:
 *  1) Parse المهام من comma-separated
 *  2) Pre-scan: عدّ المهام + اكتشاف كلمات الإلحاح (عاجل/urgent/مهم)
 *  3) استدعاء GLM للتصنيف + الترتيب + تقدير الوقت
 *  4) فرز النتائج + التحقق من ترتيب suggested_order
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const URGENCY_KEYWORDS = [
  "عاجل",
  "urgent",
  "آخر",
  "اخر",
  "deadline",
  "اليوم",
  "today",
  "غدا",
  "tomorrow",
  "فورا",
  "asap",
];
const IMPORTANT_KEYWORDS = ["مهم", "important", "critical", "أساسي", "اساسي", "حاسم"];

export const taskPrioritizerTool: MCPTool = {
  name: "task_prioritizer",
  description:
    "رتّب المهام بالأولوية + تقدير وقت + توصية. استخدمها لما المستخدم يقول 'رتّب مهامي' أو 'prioritize' أو 'أولويات'.",
  parameters: {
    type: "object",
    properties: {
      tasks: {
        type: "string",
        description: "المهام مفصولة بفواصل (مثال: كتابة تقرير، مكالمة العميل، مراجعة الكود)",
      },
    },
    required: ["tasks"],
  },
  async execute(params) {
    const tasksInput = String(params.tasks || "").trim();
    if (!tasksInput) return { success: false, error: "tasks مطلوبة" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Parse tasks ═══
      const tasksList = tasksInput
        .split(/[,،\n]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (tasksList.length === 0) {
        return { success: false, error: "ما في مهام صالحة" };
      }
      stepsCompleted.push("parse_tasks");

      // ═══ Step 2: Pre-scan — detect urgency/important keywords ═══
      const preScan = tasksList.map((t, i) => {
        const lower = t.toLowerCase();
        const urgent = URGENCY_KEYWORDS.some((k) => lower.includes(k));
        const important = IMPORTANT_KEYWORDS.some((k) => lower.includes(k));
        return { idx: i, text: t, urgent, important };
      });
      const urgentCount = preScan.filter((p) => p.urgent).length;
      const importantCount = preScan.filter((p) => p.important).length;
      stepsCompleted.push("pre_scan_keywords");

      // ═══ Step 3: AI generation — classify + prioritize ═══
      const systemPrompt = `أنت خبير إدارة وقت. رتب المهام دي بالأولوية:
${tasksList.map((t, i) => `${i + 1}. ${t}`).join("\n")}
رجّع JSON فقط:
{"prioritized":[{"task":"","priority":"high|medium|low","urgent":true,"important":true,"estimated_time":"","suggested_order":1}],"summary":"","recommendation":""}
- priority: high لو urgent + important معاً، medium لو واحد بس، low لو ولا حاجة.
- estimated_time: "30min" أو "2h" أو "1day".
- suggested_order: رقم من 1 للعدد الكلي.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: tasksList.join("، "),
        maxTokens: 1500,
        temperature: 0.4,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_classify_tasks");

      // ═══ Step 4: Sort + validate suggested_order ═══
      const data = result.data || {};
      let prioritized = Array.isArray(data.prioritized) ? data.prioritized : [];

      // ادمج الـ pre-scan مع نتائج الـ AI (fallback لو الـ AI مشiever شيء)
      prioritized = prioritized.map((p: any, i: number) => ({
        task: String(p.task || tasksList[i] || ""),
        priority: ["high", "medium", "low"].includes(p.priority)
          ? p.priority
          : preScan[i]?.urgent && preScan[i]?.important
            ? "high"
            : "medium",
        urgent: Boolean(p.urgent ?? preScan[i]?.urgent ?? false),
        important: Boolean(p.important ?? preScan[i]?.important ?? false),
        estimated_time: String(p.estimated_time || "1h"),
        suggested_order: Number(p.suggested_order) || i + 1,
      }));

      // رتّب حسب suggested_order
      prioritized.sort((a: any, b: any) => a.suggested_order - b.suggested_order);

      // أعِد ترقيم suggested_order
      prioritized = prioritized.map((p: any, i: number) => ({
        ...p,
        suggested_order: i + 1,
      }));

      const priorityCount = {
        high: prioritized.filter((p: any) => p.priority === "high").length,
        medium: prioritized.filter((p: any) => p.priority === "medium").length,
        low: prioritized.filter((p: any) => p.priority === "low").length,
      };

      stepsCompleted.push("sort_validate_order");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "task_prioritizer",
          total_tasks: tasksList.length,
          pre_scan: {
            urgent_detected: urgentCount,
            important_detected: importantCount,
          },
          prioritized,
          summary: String(data.summary || ""),
          recommendation: String(data.recommendation || ""),
          priority_distribution: priorityCount,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

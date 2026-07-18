/**
 * MCP Tool: Checklist Maker
 * فكرة من: "Use AI to organize your Todoist Inbox" + event schedule templates
 * بيعمل قائمة مهام/checklist منظّمة لمشروع أو حدث.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const checklistMakerTool: MCPTool = {
  name: "checklist_maker",
  description: "اعمل قائمة مهام/checklist لمشروع. استخدمها لما المستخدم يقول 'checklist' أو 'قائمة مهام' أو 'todo' أو 'خطوات'.",
  parameters: {
    type: "object",
    properties: {
      task: { type: "string", description: "المهمة/المشروع" },
      type: { type: "string", description: "النوع: project, travel, event, moving, wedding, custom", default: "project" },
      timeframe: { type: "string", description: "الإطار الزمني (اختياري)" },
    },
    required: ["task"],
  },
  async execute(params) {
    const task = String(params.task || "");
    const type = String(params.type || "project");
    const timeframe = String(params.timeframe || "");
    if (!task) return { success: false, error: "task مطلوبة" };
    try {
      const systemMsg = `أنت منظّم مشاريع محترف. اعمل checklist تفصيلية لـ: "${task}"
النوع: ${type}. ${timeframe ? `الإطار الزمني: ${timeframe}` : ""}

الـ checklist لازم:
- تكون مقسّمة لمراحل (phases)
- كل مرحلة فيها مهام محددة وقابلة للتنفيذ
- كل مهمة ليها priority (high/medium/low)
- تقدير الوقت لكل مهمة
- ملاحظات/نصائح للمهام المهمة

رجّع JSON فقط:
{"title":"","total_tasks":0,"estimated_time":"","phases":[{"phase":"","tasks":[{"task":"","priority":"","estimated_time":"","notes":""}]}],"quick_tips":[]}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: task,
        maxTokens: 3000,
        temperature: 0.5,
      });
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

/**
 * MCP Tool: Docker Compose Controller
 * القسم 4 #5: "docker-compose-controller"
 * الخطوات: اقبل docker-compose.yml → حلل → اقترح تحسينات → ولّد version محسّن
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const dockerComposeControllerTool: MCPTool = {
  name: "docker_compose_controller",
  description: "تحليل وتحسين docker-compose — مراجعة + تحسينات (سيناريو متكامل). استخدمها لما المستخدم يقول 'docker' أو 'compose' أو 'حاوية'.",
  parameters: {
    type: "object",
    properties: {
      composeFile: { type: "string", description: "محتوى docker-compose.yml" },
      action: { type: "string", description: "analyze, optimize, security-check (افتراضي: analyze)", default: "analyze" },
    },
    required: ["composeFile"],
  },
  async execute(params) {
    const compose = String(params.composeFile || "").trim();
    const action = String(params.action || "analyze").toLowerCase();
    if (!compose) return { success: false, error: "composeFile مطلوب" };
    try {
      const result = await callGLMForJSON({
        systemPrompt: `أنت خبير DevOps. ${action === "optimize" ? "حسّن" : action === "security-check" ? "افحص أمان" : "حلل"} docker-compose ده.
رجّع JSON:
{
  "services": [{"name":"","status":"","issues":[]}],
  "security_issues": ["مشكلة 1"],
  "performance_issues": ["مشكلة 1"],
  "best_practices": ["ممارسة 1"],
  "improvements": [{"service":"","change":"","reason":""}],
  "optimized_compose": "compose المحسّن (لو action=optimize)",
  "summary": "ملخص"
}`,
        userMessage: compose.slice(0, 2000),
        maxTokens: 500,
        temperature: 0.2,
      });
      const r = result.data || {};
      return { success: true, data: { scenario: "docker_compose_controller", action, steps: { parse: true, analyze: !!r.summary }, ...r } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};

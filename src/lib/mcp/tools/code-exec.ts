/**
 * MCP Tool — Code Execution
 * =========================
 * أداة تنفيذ كود JavaScript في sandbox آمن (vm.runInContext).
 * مفيش network / filesystem access. بيـ console.log only.
 */
import type { MCPTool } from "../types";
import { mcpCodeExec } from "@/lib/ai-tools/mcp-tools";

export const codeExecTool: MCPTool = {
  name: "code_exec",
  description:
    "Execute JavaScript code in a sandboxed Node.js VM. Use this for math, data processing, string manipulation, or quick computations. Use console.log() to print output. No filesystem or network access. Timeout 5 seconds.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "JavaScript code to execute. Use `console.log()` to produce output. Example: `console.log(2+2)`.",
      },
    },
    required: ["code"],
  },
  async execute(params) {
    const code = String(params.code || "").trim();

    if (!code) {
      return { success: false, error: "code مطلوبة" };
    }

    const result = await mcpCodeExec(code);

    return {
      success: result.success,
      data: {
        output: result.output,
        error: result.error,
      },
      error: result.error,
    };
  },
};

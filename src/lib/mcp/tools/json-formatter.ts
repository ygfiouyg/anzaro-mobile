/**
 * MCP Tool: JSON Formatter
 * بينسّق ويجمّل JSON (محلي، بدون API).
 * بيدعم: beautify, minify, validate, escape/unescape.
 */
import type { MCPTool } from "../types";

export const jsonFormatterTool: MCPTool = {
  name: "json_formatter",
  description: "نسّق وجمّل JSON (محلي). استخدمها لما المستخدم يقول 'json' أو 'format json' أو 'json formatter'.",
  parameters: {
    type: "object",
    properties: {
      json: { type: "string", description: "الـ JSON للتنسيق" },
      action: {
        type: "string",
        description: "الإجراء: beautify, minify, validate, escape, unescape (افتراضي: beautify)",
        default: "beautify",
      },
      indent: { type: "number", description: "مسافة المسافة البادئة (افتراضي: 2)", default: 2 },
    },
    required: ["json"],
  },
  async execute(params) {
    const json = String(params.json || "");
    const action = String(params.action || "beautify").toLowerCase();
    const indent = Math.min(8, Math.max(1, Number(params.indent) || 2));

    if (!json) return { success: false, error: "json مطلوب" };
    if (json.length > 100000) return { success: false, error: "JSON طويل جداً (حد 100000 حرف)" };

    try {
      let result: string;
      let isValid = true;
      let error = "";

      switch (action) {
        case "beautify":
        case "pretty":
          try {
            const parsed = JSON.parse(json);
            result = JSON.stringify(parsed, null, indent);
          } catch (e: any) {
            isValid = false;
            error = e.message;
            result = json;
          }
          break;

        case "minify":
        case "compact":
          try {
            const parsed = JSON.parse(json);
            result = JSON.stringify(parsed);
          } catch (e: any) {
            isValid = false;
            error = e.message;
            result = json;
          }
          break;

        case "validate":
          try {
            JSON.parse(json);
            result = "✓ JSON صالح";
          } catch (e: any) {
            isValid = false;
            error = e.message;
            result = "✗ JSON غير صالح";
          }
          break;

        case "escape":
          result = JSON.stringify(json).slice(1, -1);
          break;

        case "unescape":
          try {
            // wrap in quotes and parse
            result = JSON.parse(`"${json}"`);
          } catch (e: any) {
            isValid = false;
            error = "مشي مزل JSON غير صالح";
            result = json;
          }
          break;

        default:
          return { success: false, error: `إجراء غير معروف: ${action}. جرّب: beautify, minify, validate, escape, unescape` };
      }

      // إحصائيات
      const stats: any = {
        original_length: json.length,
        result_length: result.length,
      };

      if (action === "beautify" || action === "minify" || action === "pretty" || action === "compact") {
        try {
          const parsed = JSON.parse(json);
          stats.type = Array.isArray(parsed) ? "array" : typeof parsed;
          if (Array.isArray(parsed)) {
            stats.items_count = parsed.length;
          } else if (typeof parsed === "object" && parsed !== null) {
            stats.keys_count = Object.keys(parsed).length;
            stats.keys = Object.keys(parsed).slice(0, 20);
          }
          stats.depth = getDepth(parsed);
        } catch {}
      }

      return {
        success: true,
        data: {
          action,
          valid: isValid,
          error: error || null,
          result,
          ...stats,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function getDepth(obj: any, depth = 0): number {
  if (depth > 100) return depth; // prevent infinite
  if (obj === null || typeof obj !== "object") return depth;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return depth + 1;
    return Math.max(...obj.slice(0, 100).map((item) => getDepth(item, depth + 1)));
  }
  const values = Object.values(obj);
  if (values.length === 0) return depth + 1;
  return Math.max(...values.slice(0, 100).map((v) => getDepth(v, depth + 1)));
}

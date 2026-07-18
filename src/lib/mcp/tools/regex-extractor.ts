/**
 * MCP Tool: Regex Extractor
 * استخراج بيانات من نص بـ regex patterns (محلي).
 */
import type { MCPTool } from "../types";

export const regexExtractorTool: MCPTool = {
  name: "regex_extractor",
  description: "استخراج بيانات من نص بـ regex (محلي). استخدمها لما المستخدم يقول 'regex extract' أو 'استخرج pattern'.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "الـ regex pattern" },
      text: { type: "string", description: "النص للبحث فيه" },
      flags: { type: "string", description: "regex flags (افتراضي: g)", default: "g" },
    },
    required: ["pattern", "text"],
  },
  async execute(params) {
    const pattern = String(params.pattern || "");
    const text = String(params.text || "");
    const flags = String(params.flags || "g");

    if (!pattern || !text) return { success: false, error: "pattern و text مطلوبين" };
    if (text.length > 50000) return { success: false, error: "النص طويل جداً" };

    try {
      const regex = new RegExp(pattern, flags);
      const matches: any[] = [];
      let match: RegExpExecArray | null;
      let count = 0;

      while ((match = regex.exec(text)) !== null && count < 1000) {
        matches.push({
          match: match[0],
          index: match.index,
          end: match.index + match[0].length,
          groups: match.slice(1),
          named_groups: (match as any).groups || null,
        });
        count++;
        if (!regex.global) break;
      }

      // unique matches
      const unique = [...new Set(matches.map((m) => m.match))];

      return {
        success: true,
        data: {
          pattern,
          flags,
          total_matches: matches.length,
          unique_matches: unique.length,
          matches: matches.slice(0, 100),
          unique_values: unique.slice(0, 50),
        },
      };
    } catch (e: any) {
      return { success: false, error: `regex غير صالح: ${e.message}` };
    }
  },
};

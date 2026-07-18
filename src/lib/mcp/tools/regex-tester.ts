/**
 * MCP Tool: Regex Tester
 * اختبار regex patterns على نصوص (محلي، بدون API).
 * بيدعم flags + match highlighting + group extraction.
 */
import type { MCPTool } from "../types";

export const regexTesterTool: MCPTool = {
  name: "regex_tester",
  description: "اختبار regex patterns (محلي). استخدمها لما المستخدم يقول 'regex' أو 'نمط' أو 'pattern test'.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "الـ regex pattern (بدون slashes)" },
      text: { type: "string", description: "النص للاختبار" },
      flags: { type: "string", description: "regex flags (g, i, m, s, u, y) — افتراضي: g", default: "g" },
    },
    required: ["pattern", "text"],
  },
  async execute(params) {
    const pattern = String(params.pattern || "");
    const text = String(params.text || "");
    const flags = String(params.flags || "g");

    if (!pattern) return { success: false, error: "pattern مطلوب" };
    if (!text) return { success: false, error: "text مطلوب" };

    try {
      // تحقق من صحة الـ flags
      const validFlags = /^[gimsuy]*$/;
      if (!validFlags.test(flags)) {
        return { success: false, error: "flags غير صالحة. استخدم: g, i, m, s, u, y" };
      }

      // بناء الـ regex
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch (e: any) {
        return { success: false, error: `regex غير صالح: ${e.message}` };
      }

      // إيجاد كل الـ matches
      const matches: any[] = [];
      const globalRegex = new RegExp(pattern, flags.includes("g") ? flags : flags + "g");

      let match: RegExpExecArray | null;
      let matchCount = 0;
      const maxMatches = 1000;

      while ((match = globalRegex.exec(text)) !== null && matchCount < maxMatches) {
        const start = match.index;
        const end = start + match[0].length;
        const groups: string[] = [];
        for (let i = 1; i < match.length; i++) {
          groups.push(match[i] || "");
        }

        matches.push({
          match: match[0],
          index: start,
          end,
          length: match[0].length,
          groups: groups.length > 0 ? groups : null,
          named_groups: (match.groups || null),
        });

        matchCount++;

        // prevent infinite loop on zero-length matches
        if (match[0] === "") {
          globalRegex.lastIndex++;
        }
      }

      // تحقق من تطابق
      const testMatch = regex.test(text);
      const isFullMatch = text.match(new RegExp(`^${pattern}$`, flags.replace(/g/g, ""))) !== null;

      // highlighted text (بالـ matches)
      let highlighted = text;
      let offset = 0;
      for (const m of matches.slice(0, 100)) {
        const before = highlighted.slice(0, m.index + offset);
        const matched = highlighted.slice(m.index + offset, m.end + offset);
        const after = highlighted.slice(m.end + offset);
        highlighted = `${before}【${matched}】${after}`;
        offset += 4; // 2 لكل قوس
      }

      return {
        success: true,
        data: {
          pattern,
          flags,
          text_length: text.length,
          text_preview: text.slice(0, 200),
          matches_count: matches.length,
          is_match: testMatch,
          is_full_match: isFullMatch,
          matches: matches.slice(0, 100),
          first_match: matches[0]?.match || null,
          last_match: matches[matches.length - 1]?.match || null,
          highlighted_text: highlighted.slice(0, 2000),
          truncated: matches.length > 100,
          warnings: matchCount >= maxMatches ? [`وصل للحد الأقصى (${maxMatches}) matches`] : [],
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

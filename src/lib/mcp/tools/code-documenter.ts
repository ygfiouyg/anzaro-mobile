/**
 * MCP Tool: Code Documenter (Scenario)
 * سيناريو متعدد الخطوات: توثيق كود + شرح + استخدام + تحسينات + تعقيد
 *
 * الخطوات:
 *  1) التحقق من المدخلات + كشف اللغة (basic) + عدّ الأسطر
 *  2) استخراج تواقيع الدوال بـ regex (function/const/def/class)
 *  3) استدعاء GLM للتوثيق + الشرح + التحسينات
 *  4) دمج التواقيع المستخرجة مع توثيق الـ AI + التحقق
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

function detectLanguage(code: string): string {
  if (/\bdef\s+\w+\s*\(/.test(code) || /\bimport\s+\w+/.test(code)) return "python";
  if (/\bfunc\s+\w+/.test(code) || /\bpackage\s+main/.test(code)) return "go";
  if (/\bfunc\s+\w+/ .test(code) && /\bswift\b/i.test(code)) return "swift";
  if (/\bfn\s+\w+/.test(code) || /\bimpl\s+/.test(code)) return "rust";
  if (/<\?php/.test(code)) return "php";
  if (/\bpublic\s+class\b/.test(code) || /\bSystem\.out/.test(code)) return "java";
  if (/\bfunction\s+\w+/.test(code) || /\bconst\s+\w+\s*=/.test(code) || /=>/.test(code))
    return "javascript";
  if (/\binterface\s+\w+/.test(code) || /:\s*(string|number|boolean)\b/.test(code))
    return "typescript";
  return "unknown";
}

function extractFunctionSignatures(code: string, lang: string): any[] {
  const sigs: any[] = [];
  const patterns: Record<string, RegExp> = {
    javascript: /(?:export\s+)?(?:async\s+)?(?:function|const|let)\s+(\w+)\s*(?:\(([^)]*)\)|=\s*(?:async\s*)?\(([^)]*)\))/g,
    typescript: /(?:export\s+)?(?:async\s+)?(?:function|const|let)\s+(\w+)\s*(?:<[^>]*>)?\s*(?:\(([^)]*)\)|=\s*(?:async\s*)?\(([^)]*)\))/g,
    python: /def\s+(\w+)\s*\(([^)]*)\)/g,
    go: /func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(([^)]*)\)/g,
    rust: /(?:pub\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g,
    java: /(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\(([^)]*)\)/g,
    php: /function\s+(\w+)\s*\(([^)]*)\)/g,
  };
  const re = patterns[lang] || patterns.javascript;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    sigs.push({
      name: m[1],
      params: m[2] || m[3] || "",
      description: "",
      returns: "",
    });
    if (sigs.length >= 15) break; // حد أقصى
  }
  return sigs;
}

export const codeDocumenterTool: MCPTool = {
  name: "code_documenter",
  description:
    "وثّق كود + اشرحه + اقترح تحسينات + مثال استخدام. استخدمها لما المستخدم يقول 'وثّق الكود' أو 'document code' أو 'اشرح الكود ده'.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "الكود المراد توثيقه" },
      language: { type: "string", description: "اللغة (اختياري — auto-detect)" },
    },
    required: ["code"],
  },
  async execute(params) {
    const code = String(params.code || "").trim();
    const langHint = String(params.language || "").trim().toLowerCase();
    if (!code || code.length < 30) {
      return { success: false, error: "code مطلوب (30 حرف على الأقل)" };
    }

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + detect language + count ═══
      const language = langHint || detectLanguage(code);
      const lineCount = code.split("\n").length;
      const charCount = code.length;
      stepsCompleted.push("detect_language");

      // ═══ Step 2: Extract function signatures ═══
      const extractedSigs = extractFunctionSignatures(code, language);
      stepsCompleted.push("extract_signatures");

      // ═══ Step 3: AI generation — documentation ═══
      const systemPrompt = `وثّق الكود ده + اشرحه.
اللغة: ${language}.
رجّع JSON فقط:
{"summary":"","functions":[{"name":"","description":"","params":"","returns":""}],"usage_example":"","improvements":[],"complexity":""}
- summary 2-3 أسطر.
- functions: لكل دالة في الكود.
- usage_example كود قابل للتشغيل.
- improvements 3-5 تحسينات.
- complexity: O(1), O(n), O(n²) إلخ.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: code.slice(0, 6000),
        maxTokens: 2000,
        temperature: 0.3,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_document");

      // ═══ Step 4: Merge extracted sigs with AI docs ═══
      const data = result.data || {};
      const aiFunctions = Array.isArray(data.functions) ? data.functions : [];

      // دمج: لو في توقيع مستخرج مش موجود في AI، زوّده
      const aiNames = new Set(aiFunctions.map((f: any) => String(f.name || "")));
      const merged = [
        ...aiFunctions.map((f: any) => ({
          name: String(f.name || ""),
          description: String(f.description || ""),
          params: String(f.params || ""),
          returns: String(f.returns || ""),
        })),
        ...extractedSigs
          .filter((s) => !aiNames.has(s.name))
          .map((s) => ({
            name: s.name,
            description: "(التوقيع مستخرج آلياً — الوصف غير متاح)",
            params: s.params,
            returns: "",
          })),
      ];

      const improvements = Array.isArray(data.improvements)
        ? data.improvements.map((i: any) => String(i))
        : [];
      stepsCompleted.push("merge_validate");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "code_documenter",
          language,
          code_stats: { lines: lineCount, chars: charCount },
          extracted_signatures_count: extractedSigs.length,
          summary: String(data.summary || ""),
          functions: merged,
          usage_example: String(data.usage_example || ""),
          improvements,
          complexity: String(data.complexity || ""),
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

/**
 * MCP Tool: XML Formatter
 * تنسيق/validate XML (محلي).
 */
import type { MCPTool } from "../types";

export const xmlFormatterTool: MCPTool = {
  name: "xml_formatter",
  description: "تنسيق/validate XML (محلي). استخدمها لما المستخدم يقول 'xml' أو 'format xml'.",
  parameters: {
    type: "object",
    properties: {
      xml: { type: "string", description: "الـ XML للمعالجة" },
      action: { type: "string", description: "beautify, minify, validate (افتراضي: beautify)", default: "beautify" },
      indent: { type: "number", description: "مسافة البادئة (افتراضي: 2)", default: 2 },
    },
    required: ["xml"],
  },
  async execute(params) {
    const xml = String(params.xml || "");
    const action = String(params.action || "beautify").toLowerCase();
    const indent = Math.min(8, Math.max(1, Number(params.indent) || 2));

    if (!xml) return { success: false, error: "xml مطلوب" };
    if (xml.length > 100000) return { success: false, error: "XML طويل جداً" };

    try {
      let result: string;
      let isValid = true;
      let error = "";

      switch (action) {
        case "beautify":
        case "pretty":
          result = beautifyXML(xml, indent);
          break;

        case "minify":
        case "compact":
          result = xml.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
          break;

        case "validate":
          const validation = validateXML(xml);
          isValid = validation.valid;
          error = validation.error || "";
          result = validation.valid ? "✓ XML صالح" : `✗ ${validation.error}`;
          break;

        default:
          return { success: false, error: `إجراء غير معروف: ${action}` };
      }

      return {
        success: true,
        data: {
          action,
          valid: isValid,
          error: error || null,
          result: result.slice(0, 20000),
          original_length: xml.length,
          result_length: result.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function beautifyXML(xml: string, indent: number): string {
  let formatted = "";
  let level = 0;
  let inTag = false;
  let inContent = false;
  let currentTag = "";
  let currentContent = "";
  let prevChar = "";

  // minify الأول
  xml = xml.replace(/>\s+</g, "><").trim();

  for (let i = 0; i < xml.length; i++) {
    const ch = xml[i];

    if (ch === "<") {
      // content قبل الـ tag
      if (currentContent.trim()) {
        formatted += " ".repeat(level * indent) + currentContent.trim() + "\n";
      }
      currentContent = "";
      inTag = true;
      currentTag = "<";

      // self-closing or closing
      if (xml[i + 1] === "/") {
        level = Math.max(0, level - 1);
        formatted += " ".repeat(level * indent);
      } else if (xml[i + 1] !== "?" && xml[i + 1] !== "!") {
        // check if not self-closing
        if (formatted && prevChar !== ">" ) {
          formatted += " ".repeat(level * indent);
        } else {
          formatted += " ".repeat(level * indent);
        }
      } else {
        formatted += " ".repeat(level * indent);
      }
    } else if (ch === ">") {
      inTag = false;
      currentTag += ">";
      formatted += currentTag;

      // check self-closing
      if (currentTag.endsWith("/>") || currentTag.startsWith("<?") || currentTag.startsWith("<!")) {
        formatted += "\n";
      } else if (currentTag.startsWith("</")) {
        formatted += "\n";
      } else {
        // opening tag — check if next is content or tag
        level++;
        // peek next non-whitespace
        let nextCh = xml[i + 1];
        if (nextCh && nextCh !== "<") {
          // inline content
          let endIdx = xml.indexOf("<", i + 1);
          if (endIdx > 0) {
            const content = xml.slice(i + 1, endIdx).trim();
            if (content) {
              formatted += content;
              // add closing tag inline
              const closeEnd = xml.indexOf(">", endIdx);
              if (closeEnd > 0) {
                formatted += xml.slice(endIdx, closeEnd + 1);
                i = closeEnd;
                level--;
                formatted += "\n";
                prevChar = ">";
                continue;
              }
            }
          }
          formatted += "\n";
        } else {
          formatted += "\n";
        }
      }
      currentTag = "";
    } else if (inTag) {
      currentTag += ch;
    } else {
      currentContent += ch;
    }
    prevChar = ch;
  }

  return formatted;
}

function validateXML(xml: string): { valid: boolean; error?: string } {
  // basic validation: balanced tags
  const tagStack: string[] = [];
  const tagRegex = /<(\/?)([\w:-]+)([^>]*)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const isClosing = match[1] === "/";
    const tagName = match[2];
    const attrs = match[3];

    // skip self-closing, declarations, comments
    if (attrs.includes("/>") || tagName === "?xml" || tagName.startsWith("!")) {
      continue;
    }

    if (isClosing) {
      if (tagStack.length === 0) {
        return { valid: false, error: `إغلاق tag بدون فتح: </${tagName}>` };
      }
      const last = tagStack.pop();
      if (last !== tagName) {
        return { valid: false, error: `عدم تطابق: expected </${last}> but got </${tagName}>` };
      }
    } else {
      tagStack.push(tagName);
    }
  }

  if (tagStack.length > 0) {
    return { valid: false, error: `tags غير مغلقة: ${tagStack.join(", ")}` };
  }

  return { valid: true };
}

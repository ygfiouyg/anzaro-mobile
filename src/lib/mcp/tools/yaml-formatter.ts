/**
 * MCP Tool: YAML Formatter
 * parse/format YAML بسيط (محلي).
 * parser مبسط — مش بيدعم كل ميزات YAML المتقدمة.
 */
import type { MCPTool } from "../types";

export const yamlFormatterTool: MCPTool = {
  name: "yaml_formatter",
  description: "parse YAML لـ JSON + validate (محلي). استخدمها لما المستخدم يقول 'yaml' أو 'yml'.",
  parameters: {
    type: "object",
    properties: {
      yaml: { type: "string", description: "الـ YAML للمعالجة" },
      action: { type: "string", description: "parse, validate, from_json (افتراضي: parse)", default: "parse" },
      json: { type: "string", description: "JSON للتحويل لـ YAML (لـ from_json)" },
    },
    required: ["yaml"],
  },
  async execute(params) {
    const yaml = String(params.yaml || "");
    const action = String(params.action || "parse").toLowerCase();

    if (!yaml && action !== "from_json") return { success: false, error: "yaml مطلوب" };

    try {
      switch (action) {
        case "parse": {
          const parsed = parseYAML(yaml);
          if (parsed.error) {
            return { success: false, error: parsed.error };
          }
          return {
            success: true,
            data: {
              action,
              json: parsed.data,
              json_string: JSON.stringify(parsed.data, null, 2).slice(0, 10000),
            },
          };
        }

        case "validate": {
          const parsed = parseYAML(yaml);
          return {
            success: true,
            data: {
              action,
              valid: !parsed.error,
              error: parsed.error || null,
            },
          };
        }

        case "from_json": {
          const jsonStr = String(params.json || yaml);
          let jsonObj: any;
          try {
            jsonObj = JSON.parse(jsonStr);
          } catch (e: any) {
            return { success: false, error: `JSON غير صالح: ${e.message}` };
          }
          const yamlResult = jsonToYAML(jsonObj, 0);
          return {
            success: true,
            data: {
              action,
              yaml: yamlResult,
            },
          };
        }

        default:
          return { success: false, error: `إجراء غير معروف: ${action}` };
      }
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function parseYAML(yaml: string): { data: any; error?: string } {
  try {
    const lines = yaml.split("\n");
    const result: any = {};
    let currentKey = "";
    let inList = false;
    let listItems: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // skip empty and comments
      if (!trimmed || trimmed.startsWith("#")) continue;

      // document start
      if (trimmed === "---") continue;

      // list item
      if (trimmed.startsWith("- ")) {
        inList = true;
        const value = trimmed.slice(2).trim();
        listItems.push(parseValue(value));
        continue;
      }

      // key: value
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        // save previous list
        if (inList) {
          result[currentKey] = listItems;
          inList = false;
          listItems = [];
        }

        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();

        if (value === "") {
          // could be nested or list
          currentKey = key;
          result[key] = {};
        } else {
          result[key] = parseValue(value);
          currentKey = key;
        }
      }
    }

    // final list
    if (inList) {
      result[currentKey] = listItems;
    }

    return { data: result };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

function parseValue(value: string): any {
  // remove quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // boolean
  if (value === "true" || value === "yes") return true;
  if (value === "false" || value === "no") return false;
  if (value === "null" || value === "~") return null;

  // number
  if (/^-?\d+$/.test(value)) return parseInt(value);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  // array [1, 2, 3]
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1).split(",").map((s) => parseValue(s.trim()));
    }
  }

  // object {a: 1}
  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function jsonToYAML(obj: any, indent: number): string {
  const spaces = " ".repeat(indent);
  let result = "";

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === "object" && item !== null) {
        const nested = jsonToYAML(item, indent + 2);
        result += `${spaces}- ${nested.trimStart()}\n`;
      } else {
        result += `${spaces}- ${formatYAMLValue(item)}\n`;
      }
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "object" && value !== null) {
        result += `${spaces}${key}:\n`;
        result += jsonToYAML(value, indent + 2);
      } else {
        result += `${spaces}${key}: ${formatYAMLValue(value)}\n`;
      }
    }
  }

  return result;
}

function formatYAMLValue(value: any): string {
  if (value === null) return "null";
  if (value === undefined) return "null";
  if (typeof value === "string") {
    if (value.includes(":") || value.includes("#") || value.includes("\n")) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

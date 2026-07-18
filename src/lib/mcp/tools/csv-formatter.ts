/**
 * MCP Tool: CSV Formatter
 * parse/format/validate CSV (محلي).
 */
import type { MCPTool } from "../types";

export const csvFormatterTool: MCPTool = {
  name: "csv_formatter",
  description: "parse/format/validate CSV (محلي). استخدمها لما المستخدم يقول 'csv' أو 'جدول' أو 'comma separated'.",
  parameters: {
    type: "object",
    properties: {
      csv: { type: "string", description: "الـ CSV للمعالجة" },
      action: { type: "string", description: "parse, to_json, from_json, validate (افتراضي: parse)", default: "parse" },
      delimiter: { type: "string", description: "الفاصل (افتراضي: ,)", default: "," },
      hasHeader: { type: "boolean", description: "فيه header؟ (افتراضي: true)", default: true },
    },
    required: ["csv"],
  },
  async execute(params) {
    const csv = String(params.csv || "");
    const action = String(params.action || "parse").toLowerCase();
    const delimiter = String(params.delimiter || ",")[0] || ",";
    const hasHeader = params.hasHeader !== false;

    if (!csv) return { success: false, error: "csv مطلوب" };
    if (csv.length > 100000) return { success: false, error: "CSV طويل جداً" };

    try {
      switch (action) {
        case "parse":
        case "to_json": {
          const rows = parseCSV(csv, delimiter);
          const headers = hasHeader ? rows[0] : rows[0].map((_, i) => `column_${i + 1}`);
          const dataRows = hasHeader ? rows.slice(1) : rows;
          const json = dataRows.map((row) => {
            const obj: any = {};
            headers.forEach((h, i) => {
              obj[h] = row[i] ?? "";
            });
            return obj;
          });
          return {
            success: true,
            data: {
              action,
              headers,
              rows_count: dataRows.length,
              columns_count: headers.length,
              data: json.slice(0, 100),
              total_rows: dataRows.length,
            },
          };
        }

        case "from_json": {
          // csv field contains JSON array
          let jsonArr: any[];
          try {
            jsonArr = JSON.parse(csv);
          } catch {
            return { success: false, error: "الـ input مش JSON صالح" };
          }
          if (!Array.isArray(jsonArr) || jsonArr.length === 0) {
            return { success: false, error: "JSON لازم يكون array غير فارغ" };
          }
          const headers = Object.keys(jsonArr[0]);
          const lines = [headers.join(delimiter)];
          for (const row of jsonArr) {
            lines.push(headers.map((h) => escapeCSV(String(row[h] ?? ""), delimiter)).join(delimiter));
          }
          return {
            success: true,
            data: {
              action,
              csv: lines.join("\n"),
              rows_count: jsonArr.length,
              columns_count: headers.length,
            },
          };
        }

        case "validate": {
          const rows = parseCSV(csv, delimiter);
          const colCount = rows[0]?.length || 0;
          const inconsistent = rows.filter((r) => r.length !== colCount).length;
          return {
            success: true,
            data: {
              action,
              valid: inconsistent === 0,
              total_rows: rows.length,
              columns_in_first_row: colCount,
              inconsistent_rows: inconsistent,
              message: inconsistent === 0 ? "✓ CSV صالح" : `${inconsistent} صف بأعداد أعمدة مختلفة`,
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

function parseCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField);
        currentField = "";
      } else if (ch === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else if (ch !== "\r") {
        currentField += ch;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

function escapeCSV(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

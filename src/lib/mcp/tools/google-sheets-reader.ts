import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";
interface ValuesResponse { range?: string; values?: string[][]; majorDimension?: string; }
interface SheetMetaResponse { sheets?: Array<{ properties?: { title?: string; sheetId?: number; index?: number } }>; properties?: { title?: string }; }

function extractSheetId(input: string): string | null {
  const raw = (input || "").trim(); if (!raw) return null;
  const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/); if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw; return null;
}

export const googleSheetsReaderTool: MCPTool = {
  name: "google_sheets_reader",
  description: "اقرا صفوف من Google Sheet موجود بالـ ID أو الرابط (spreadsheets scope). استخدمها لما المستخدم يقول 'حلللي شيت المصاريف' أو 'اقرا البيانات من الـ sheet'.",
  parameters: { type: "object", properties: {
    spreadsheet_id: { type: "string", description: "رابط أو ID للـ spreadsheet" },
    range: { type: "string", description: "النطاق (افتراضي Sheet1!A1:Z1000)" },
    max_rows: { type: "number", description: "أقصى صفوف (افتراضي 500)" },
    list_sheets: { type: "boolean", description: "لو true → بترجع قائمة بالـ sheets في الملف بس بدون قراية صفوف (افتراضي false)" },
    value_render: { type: "string", enum: ["UNFORMATTED_VALUE", "FORMATTED_VALUE", "FORMULA"], description: "إزاي تـ render القيم (افتراضي UNFORMATTED_VALUE). FORMULA لو عاوز تشوف الصيغ." },
  }, required: ["spreadsheet_id"] },
  async execute(params) {
    const spreadsheetId = extractSheetId(String(params.spreadsheet_id || ""));
    if (!spreadsheetId) return { success: false, error: "مش قادر أستخرج spreadsheet_id." };
    const maxRows = Number(params.max_rows) > 0 ? Math.min(Number(params.max_rows), 2000) : 500;
    const valueRender = String(params.value_render || "UNFORMATTED_VALUE");
    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };
    const headers = { Authorization: `Bearer ${auth.accessToken}` };

    // ── list_sheets mode: بترجع قائمة بالـ sheets بس ──
    if (params.list_sheets === true) {
      const metaResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties,properties.title`, { headers });
      if (!metaResp.ok) return { success: false, error: await formatGoogleError(metaResp, "spreadsheets.get") };
      const meta = (await metaResp.json()) as SheetMetaResponse;
      const sheets = (meta.sheets ?? []).map((s, i) => ({
        index: i,
        title: s.properties?.title ?? `Sheet${i+1}`,
        sheet_id: s.properties?.sheetId ?? null,
      }));
      return { success: true, data: { spreadsheet_id: spreadsheetId, title: meta.properties?.title ?? null, sheets, read_by: auth.user?.email ?? null } };
    }

    const range = String(params.range || "Sheet1!A1:Z1000").trim();
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
    url.searchParams.set("valueRenderOption", valueRender);
    url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
    const resp = await fetch(url, { headers });
    if (!resp.ok) return { success: false, error: await formatGoogleError(resp, "spreadsheets.values.get") };
    const data = (await resp.json()) as ValuesResponse;
    const allRows = data.values ?? [];
    const totalRows = allRows.length;
    const trimmed = allRows.slice(0, maxRows);
    const header = trimmed[0] ?? [];
    const dataRows = trimmed.slice(1);
    const objects = dataRows.map((row) => { const obj: Record<string,string> = {}; header.forEach((h,i) => { obj[h || `col_${i+1}`] = String(row[i] ?? ""); }); return obj; });

    // ── Quick stats لو فيه أرقام ──
    let stats: Record<string, { sum: number; count: number; min: number; max: number }> | null = null;
    if (header.length > 0 && dataRows.length > 0 && valueRender === "UNFORMATTED_VALUE") {
      stats = {};
      header.forEach((h, colIdx) => {
        const nums = dataRows.map(r => Number(r[colIdx])).filter(n => !isNaN(n) && isFinite(n));
        if (nums.length > 0) {
          stats![h || `col_${colIdx+1}`] = {
            sum: nums.reduce((a, b) => a + b, 0),
            count: nums.length,
            min: Math.min(...nums),
            max: Math.max(...nums),
          };
        }
      });
      if (Object.keys(stats).length === 0) stats = null;
    }

    return { success: true, data: {
      spreadsheet_id: spreadsheetId,
      range: data.range ?? range,
      total_rows_in_range: totalRows,
      returned_rows: trimmed.length,
      truncated: totalRows > maxRows,
      header,
      rows_as_objects: objects,
      numeric_stats: stats,
      read_by: auth.user?.email ?? null,
    } };
  },
};
export default googleSheetsReaderTool;

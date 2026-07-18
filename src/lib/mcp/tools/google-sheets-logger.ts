/**
 * MCP Tool: Google Sheets Logger
 * ===============================
 * Creates a new Google Sheet and appends a row of data. Perfect for
 * logging structured data points (expenses, habits, events, etc.)
 * without the user leaving the chat.
 *
 * Endpoint:
 *   POST https://sheets.googleapis.com/v4/spreadsheets              → create sheet
 *   POST https://sheets.googleapis.com/v4/spreadsheets/{id}/values/  → append row
 * Scope: https://www.googleapis.com/auth/spreadsheets
 */

import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

interface CreatedSheet {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: { title?: string };
}

interface AppendResponse {
  updates?: { updatedRange?: string; updatedRows?: number };
}

export const googleSheetsLoggerTool: MCPTool = {
  name: "google_sheets_logger",
  description:
    "أنشئ Google Sheet جديد وسجل فيه صف من البيانات (يصلح لـ logging المصاريف/العادات/الأحداث). " +
    "استخدمها لما المستخدم يقول «سجّل في شيت: صرفت 50 جنيه على غدا» أو «اعمل spreadsheet جديدة للبيانات دي». " +
    "بتشتغل بـ OAuth access_token (spreadsheets scope).",

  parameters: {
    type: "object",
    properties: {
      spreadsheetTitle: {
        type: "string",
        description: "اسم الـ spreadsheet الجديد (مثال: 'مصاريف يوليو').",
      },
      rowValues: {
        type: "array",
        items: { type: "string" },
        description: "القيم اللي تتسجل في الصف (مثال: ['2026-07-15', 'غداء', '50']).",
      },
      multipleRows: {
        type: "array",
        items: { type: "array", items: { type: "string" } },
        description: "لو عاوز تسجل أكتر من صف: array من الـ rows (مثال: [['a','b'],['c','d']]).",
      },
      headerRow: {
        type: "array",
        items: { type: "string" },
        description: "اختياري: صف العناوين اللي يتكتب في الصف الأول (مثال: ['التاريخ','البند','المبلغ']).",
      },
      sheetName: {
        type: "string",
        description: "اسم الـ sheet/tab جوه الـ spreadsheet (افتراضي 'Sheet1').",
        default: "Sheet1",
      },
      folder_id: {
        type: "string",
        description: "ID فولدر في Drive تحط فيه الـ spreadsheet (اختياري).",
      },
    },
    required: ["spreadsheetTitle", "rowValues"],
  },

  async execute(params) {
    const title = String(params.spreadsheetTitle || "").trim();
    if (!title) {
      return { success: false, error: "لازم تدي spreadsheetTitle للشيت الجديد." };
    }
    const rowValues = params.rowValues;
    const multipleRows = params.multipleRows;
    if (!Array.isArray(rowValues) || rowValues.length === 0) {
      return { success: false, error: "لازم تدي rowValues (array غير فاضي)." };
    }
    const sheetName = String(params.sheetName || "Sheet1").trim();
    const folderId = String(params.folder_id || "").trim();
    const row = rowValues.map((v) => String(v ?? ""));
    const headerRow = Array.isArray(params.headerRow)
      ? params.headerRow.map((v) => String(v ?? ""))
      : null;

    // ── Auth ──────────────────────────────────────────────────────────
    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    };

    // ── 1. Create the spreadsheet ────────────────────────────────────
    const createResp = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        properties: { title },
        sheets: [{ properties: { title: sheetName } }],
      }),
    });
    if (!createResp.ok) {
      return { success: false, error: await formatGoogleError(createResp, "spreadsheets.create") };
    }
    const created = (await createResp.json()) as CreatedSheet;
    const spreadsheetId = created.spreadsheetId;

    // ── Move to folder (optional) ─────────────────────────────────────
    if (folderId) {
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        });
      } catch {}
    }

    // ── 2. Append header + single row + multipleRows ──────────────────
    const allDataRows: string[][] = [];
    if (headerRow) allDataRows.push(headerRow);
    allDataRows.push(row);
    if (Array.isArray(multipleRows)) {
      for (const mr of multipleRows) {
        if (Array.isArray(mr)) allDataRows.push(mr.map((v) => String(v ?? "")));
      }
    }

    const appendResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ values: allDataRows }),
      },
    );

    if (!appendResp.ok) {
      const err = await formatGoogleError(appendResp, "spreadsheets.values.append");
      return {
        success: true,
        data: {
          spreadsheet_id: spreadsheetId,
          link: created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          warning: `الشيت اتعمل بس حصل خطأ في كتابة الصفوف: ${err}`,
          created_by: auth.user?.email ?? null,
        },
      };
    }

    const appended = (await appendResp.json()) as AppendResponse;

    return {
      success: true,
      data: {
        spreadsheet_id: spreadsheetId,
        title,
        sheet_name: sheetName,
        link: created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        rows_written: allDataRows.length,
        data_rows: allDataRows.length - (headerRow ? 1 : 0),
        updated_range: appended.updates?.updatedRange ?? null,
        header_included: !!headerRow,
        folder_id: folderId || null,
        created_by: auth.user?.email ?? null,
      },
    };
  },
};

export default googleSheetsLoggerTool;

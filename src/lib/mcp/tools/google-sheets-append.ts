/**
 * MCP Tool: Google Sheets Append
 * تكامل حقيقي مع Google Sheets API — إضافة صف لـ spreadsheet.
 *
 * محتاج env vars:
 *   GOOGLE_SHEETS_CLIENT_EMAIL — service account email
 *   GOOGLE_SHEETS_PRIVATE_KEY — service account private key
 *
 * أو بدائل أبسط:
 *   GOOGLE_SHEETS_WEBHOOK_URL — لو بتستخدم Apps Script webhook
 */
import type { MCPTool } from "../types";

export const googleSheetsAppendTool: MCPTool = {
  name: "google_sheets_append",
  description: "ضيف صف لـ Google Sheet (API حقيقي). استخدمها لما المستخدم يقول 'google sheets' أو 'سبريدشيت' أو 'أضف صف'.",
  parameters: {
    type: "object",
    properties: {
      spreadsheetId: { type: "string", description: "ID الـ spreadsheet (من الـ URL)" },
      sheetName: { type: "string", description: "اسم الـ sheet/tab", default: "Sheet1" },
      values: { type: "string", description: "القيم مفصولة بـ | (مثلاً: val1|val2|val3)" },
    },
    required: ["spreadsheetId", "values"],
  },
  async execute(params) {
    const spreadsheetId = String(params.spreadsheetId || "").trim();
    const sheetName = String(params.sheetName || "Sheet1").trim();
    const valuesRaw = String(params.values || "").trim();

    if (!spreadsheetId || !valuesRaw) {
      return { success: false, error: "spreadsheetId و values مطلوبين" };
    }

    const values = valuesRaw.split("|").map((v) => v.trim());

    // طريقة 1: Apps Script Webhook (الأسهل)
    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadsheetId,
            sheetName,
            values,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          return { success: false, error: `Sheets webhook error ${res.status}` };
        }

        const data: any = await res.json().catch(() => ({}));
        return {
          success: true,
          data: {
            method: "apps_script_webhook",
            spreadsheetId,
            sheetName,
            values,
            appended: true,
            response: data,
          },
        };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    // طريقة 2: Service Account (محتاج googleapis)
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

    if (clientEmail && privateKey) {
      try {
        const { google } = await import("googleapis");

        const auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey.replace(/\\n/g, "\n"),
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const sheets = google.sheets({ version: "v4", auth });

        const response = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:A`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [values] },
        });

        return {
          success: true,
          data: {
            method: "service_account",
            spreadsheetId,
            sheetName,
            values,
            updatedRange: response.data.updates?.updatedRange || "",
            updatedRows: response.data.updates?.updatedRows || 0,
          },
        };
      } catch (e: any) {
        return { success: false, error: `Google Sheets API: ${e.message}` };
      }
    }

    return {
      success: false,
      error: "محتاج GOOGLE_SHEETS_WEBHOOK_URL أو (GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY)",
    };
  },
};

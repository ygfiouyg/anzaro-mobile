/**
 * MCP Tool: Google Drive File Uploader
 * =====================================
 * يرفع ملف جديد لـ Google Drive بتاع المستخدم.
 *
 * Endpoint: POST https://www.googleapis.com/drive/v3/files (metadata)
 *           POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
 * Scope:    https://www.googleapis.com/auth/drive.file
 */

import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

interface UploadResponse {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
}

export const googleDriveUploaderTool: MCPTool = {
  name: "google_drive_uploader",
  description:
    "ارفع ملف نصي جديد لـ Google Drive بتاع المستخدم. " +
    "استخدمها لما المستخدم يقول 'ارفعلي ملف' أو 'احفظ النص ده في Drive'. " +
    "بتشتغل بـ OAuth access_token (drive.file scope).",

  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "اسم الملف في Drive (مثال: 'ملاحظات.txt' أو 'ملخص.md').",
      },
      content: {
        type: "string",
        description: "محتوى الملف (نص عادي).",
      },
      mimeType: {
        type: "string",
        description: "نوع الملف (افتراضي text/plain). مثال: 'text/plain', 'text/markdown', 'application/json'.",
        default: "text/plain",
      },
      folder_id: {
        type: "string",
        description: "ID فولدر تحط الملف جواه (اختياري). لو مش متاح، بيتعمل في الـ root.",
      },
      description: {
        type: "string",
        description: "وصف الملف (اختياري — بيظهر في تفاصيل الملف في Drive).",
      },
      starred: {
        type: "boolean",
        description: "هل تضيف نجمة للملف (مميز)؟ (افتراضي false).",
        default: false,
      },
    },
    required: ["name", "content"],
  },

  async execute(params) {
    const name = String(params.name || "").trim();
    const content = String(params.content || "");
    const mimeType = String(params.mimeType || "text/plain").trim();
    const folderId = String(params.folder_id || "").trim();

    if (!name) return { success: false, error: "لازم تدي name للملف." };
    if (!content) return { success: false, error: "لازم تدي content للملف." };

    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };

    // multipart upload: metadata + content
    const boundary = "anzaro-" + Math.random().toString(36).slice(2);
    const description = String(params.description || "").trim();
    const starred = params.starred === true;
    const metadata: Record<string, unknown> = { name, mimeType };
    if (folderId) metadata.parents = [folderId];
    if (description) metadata.description = description;
    if (starred) metadata.starred = true;

    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      "",
      content,
      `--${boundary}--`,
    ].join("\r\n");

    const resp = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );

    if (!resp.ok) {
      return { success: false, error: await formatGoogleError(resp, "drive.files.upload") };
    }

    const file = (await resp.json()) as UploadResponse;
    return {
      success: true,
      data: {
        file_id: file.id,
        name,
        mime_type: file.mimeType ?? mimeType,
        size_bytes: content.length,
        link: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
        folder_id: folderId || null,
        uploaded_by: auth.user?.email ?? null,
      },
    };
  },
};

export default googleDriveUploaderTool;

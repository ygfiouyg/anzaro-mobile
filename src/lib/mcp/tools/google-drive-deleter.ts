/**
 * MCP Tool: Google Drive File Deleter
 * ====================================
 * يمسح ملف أو فولدر من Google Drive بتاع المستخدم.
 *
 * Endpoint: DELETE https://www.googleapis.com/drive/v3/files/{id}
 * Scope:    https://www.googleapis.com/auth/drive.file
 */

import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

export const googleDriveDeleterTool: MCPTool = {
  name: "google_drive_deleter",
  description:
    "امسح ملف أو فولدر من Google Drive بتاع المستخدم. " +
    "استخدمها لما المستخدم يقول 'امسح ملف كذا' أو 'احذف الفولدر ده'. " +
    "بتشتغل بـ OAuth access_token (drive.file scope). ⚠️ الملف بيتحط في Trash الأول (مش بيرجع).",

  parameters: {
    type: "object",
    properties: {
      file_id: {
        type: "string",
        description: "ID الملف/الفولدر اللي عاوز تمسحه (مطلوب). ممكن تجيبه من google_drive_file_search.",
      },
      permanent: {
        type: "boolean",
        description: "لو true → مسح دائم (permanent delete). لو false (افتراضي) → يحطه في Trash.",
        default: false,
      },
    },
    required: ["file_id"],
  },

  async execute(params) {
    const fileId = String(params.file_id || "").trim();
    if (!fileId) return { success: false, error: "لازم تدي file_id للملف اللي عاوز تمسحه." };

    const permanent = params.permanent === true;

    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };

    // الأول: نجيب اسم الملف (عشان نرجعه للمستخدم)
    let fileName: string | null = null;
    try {
      const metaResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
        { headers: { Authorization: `Bearer ${auth.accessToken}` } },
      );
      if (metaResp.ok) {
        const meta = (await metaResp.json()) as { name?: string; mimeType?: string };
        fileName = meta.name ?? null;
      }
    } catch {
      // مش مهم لو فشلنا نجيب الاسم
    }

    // المسح
    const url = permanent
      ? `https://www.googleapis.com/drive/v3/files/${fileId}`
      : `https://www.googleapis.com/drive/v3/files/${fileId}`;

    const resp = await fetch(url, {
      method: permanent ? "DELETE" : "PATCH",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        ...(permanent ? {} : { "Content-Type": "application/json" }),
      },
      ...(permanent ? {} : { body: JSON.stringify({ trashed: true }) }),
    });

    if (!resp.ok) {
      return { success: false, error: await formatGoogleError(resp, "drive.files.delete") };
    }

    return {
      success: true,
      data: {
        file_id: fileId,
        file_name: fileName,
        action: permanent ? "permanent_delete" : "trashed",
        deleted_by: auth.user?.email ?? null,
        note: permanent
          ? "تم المسح الدائم — لا يمكن استرجاعه."
          : "تم نقله للـ Trash. تقدر تسترجعه من Trash لو لسه داخل 30 يوم.",
      },
    };
  },
};

export default googleDriveDeleterTool;

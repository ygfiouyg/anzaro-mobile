/**
 * MCP Tool: Google Drive Folder Creator
 * ======================================
 * ينشئ فولدر جديد في Google Drive بتاع المستخدم.
 *
 * Endpoint: POST https://www.googleapis.com/drive/v3/files
 * Scope:    https://www.googleapis.com/auth/drive.file
 */

import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

interface CreatedFolder {
  id: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
}

export const googleDriveFolderCreatorTool: MCPTool = {
  name: "google_drive_folder_creator",
  description:
    "أنشئ فولدر جديد في Google Drive بتاع المستخدم. " +
    "استخدمها لما المستخدم يقول 'اعمل فولدر باسم كذا' أو 'أنشئ مجلد'. " +
    "بتشتغل بـ OAuth access_token (drive.file scope).",

  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "اسم الفولدر الجديد (مثال: 'Anzaro' أو 'محاضرات الصيدلة').",
      },
      parent_id: {
        type: "string",
        description: "ID الفولدر الأب لو عاوز تحطه جواه (اختياري).",
      },
      description: {
        type: "string",
        description: "وصف الفولدر (اختياري — بيظهر في تفاصيل الفولدر في Drive).",
      },
      starred: {
        type: "boolean",
        description: "هل تضيف نجمة للفولدر (مميز)؟ (افتراضي false).",
        default: false,
      },
    },
    required: ["name"],
  },

  async execute(params) {
    const name = String(params.name || "").trim();
    if (!name) {
      return { success: false, error: "لازم تدي name للفولدر." };
    }
    const parentId = String(params.parent_id || "").trim();
    const description = String(params.description || "").trim();
    const starred = params.starred === true;

    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };

    const body: Record<string, unknown> = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) body.parents = [parentId];
    if (description) body.description = description;
    if (starred) body.starred = true;

    const resp = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      return { success: false, error: await formatGoogleError(resp, "drive.files.create") };
    }

    const folder = (await resp.json()) as CreatedFolder;
    return {
      success: true,
      data: {
        folder_id: folder.id,
        name,
        mime_type: "application/vnd.google-apps.folder",
        link: folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`,
        parent_id: parentId || null,
        created_by: auth.user?.email ?? null,
      },
    };
  },
};

export default googleDriveFolderCreatorTool;

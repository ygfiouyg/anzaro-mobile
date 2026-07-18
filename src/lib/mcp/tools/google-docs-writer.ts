/**
 * MCP Tool: Google Docs Writer
 * =============================
 * Creates a new Google Doc, writes content into it, and returns the
 * editable link. Uses the Docs API (create + batchUpdate) with the
 * drive.file scope (the doc is owned by the app + shared with the user).
 *
 * Endpoints:
 *   POST https://docs.googleapis.com/v1/documents           → create doc
 *   POST https://docs.googleapis.com/v1/documents/{id}:batchUpdate → insert text
 * Scope: https://www.googleapis.com/auth/documents
 */

import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

interface CreatedDoc {
  documentId: string;
}

export const googleDocsWriterTool: MCPTool = {
  name: "google_docs_writer",
  description:
    "أنشئ مستند Google Docs جديد بالعنوان والمحتوى المحدد وارجع رابط التعديل. " +
    "استخدمها لما المستخدم يقول «اكتب document عن كذا» أو «حط ده في Doc جديد». " +
    "بتشتغل بـ OAuth access_token (documents scope).",

  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "عنوان المستند الجديد.",
      },
      content: {
        type: "string",
        description: "نص المستند (يدعم أسطر جديدة — \\n للفصل بين الفقرات). اكتب '# ' قبل العنوان الفرعي عشان يطلع heading، و'- ' قبل البنود عشان list.",
      },
      folder_id: {
        type: "string",
        description: "ID مجلد في Drive تحط فيه المستند (اختياري). لو مش متاح، بيروح للـ root.",
      },
      share_with: {
        type: "string",
        description: "إيميل حد تشاركه المستند معاه (اختياري — هيوصله رابط تعديل).",
      },
    },
    required: ["title", "content"],
  },

  async execute(params) {
    const title = String(params.title || "").trim();
    const content = String(params.content || "");
    if (!title) {
      return { success: false, error: "لازم تدي title للمستند." };
    }
    if (!content) {
      return { success: false, error: "لازم تدي content للمستند." };
    }

    // ── Auth ──────────────────────────────────────────────────────────
    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    };

    // ── 1. Create the empty document ─────────────────────────────────
    const createResp = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers,
      body: JSON.stringify({ title }),
    });
    if (!createResp.ok) {
      return { success: false, error: await formatGoogleError(createResp, "documents.create") };
    }
    const created = (await createResp.json()) as CreatedDoc;
    const documentId = created.documentId;

    // ── 2. Insert the content at the start of the body ───────────────
    //    Split content by newlines so each line becomes its own paragraph.
    const lines = content.split(/\r?\n/);
    const requests = lines.map((text, i) => ({
      insertText: {
        location: { index: 1 },
        text: i === lines.length - 1 ? text : text + "\n",
      },
    }));

    const updateResp = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ requests, writeControl: {} }),
      },
    );
    if (!updateResp.ok) {
      // Doc was created but text insert failed — still return the link so
      // the user can open + edit the (empty) doc manually.
      const err = await formatGoogleError(updateResp, "documents.batchUpdate");
      return {
        success: true,
        data: {
          document_id: documentId,
          link: `https://docs.google.com/document/d/${documentId}/edit`,
          warning: `المستند اتأنشئ بس حصل خطأ في كتابة المحتوى: ${err}`,
          created_by: auth.user?.email ?? null,
        },
      };
    }

    // ── Share with someone (optional) ─────────────────────────────────
    const shareWith = String(params.share_with || "").trim();
    let shared = false;
    if (shareWith) {
      try {
        const shareResp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${documentId}/permissions`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              type: "user",
              role: "writer",
              emailAddress: shareWith,
            }),
          },
        );
        shared = shareResp.ok;
        if (!shareResp.ok) {
          console.warn("[docs-writer] share failed:", await shareResp.text().catch(() => ""));
        }
      } catch (e) {
        console.warn("[docs-writer] share error:", e);
      }
    }

    // ── Move to folder (optional) ─────────────────────────────────────
    const folderId = String(params.folder_id || "").trim();
    if (folderId) {
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${documentId}?addParents=${folderId}`, {
          method: "PATCH",
          headers,
        });
      } catch (e) {
        console.warn("[docs-writer] folder move error:", e);
      }
    }

    return {
      success: true,
      data: {
        document_id: documentId,
        title,
        link: `https://docs.google.com/document/d/${documentId}/edit`,
        chars_written: content.length,
        shared_with: shareWith && shared ? shareWith : null,
        folder_id: folderId || null,
        created_by: auth.user?.email ?? null,
      },
    };
  },
};

export default googleDocsWriterTool;

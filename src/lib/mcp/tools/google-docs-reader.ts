import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";
interface DocElement { paragraph?: { elements?: Array<{ textRun?: { content?: string } }>; paragraphStyle?: { namedStyleType?: string } }; }
interface DocumentResponse { documentId?: string; title?: string; body?: { content?: DocElement[] }; }
function extractDocId(input: string): string | null {
  const raw = (input || "").trim(); if (!raw) return null;
  const m = raw.match(/\/document\/d\/([a-zA-Z0-9_-]{20,})/); if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw; return null;
}
export const googleDocsReaderTool: MCPTool = {
  name: "google_docs_reader",
  description: "اقرا المحتوى الكامل لمستند Google Docs موجود بالـ ID أو الرابط (documents scope). استخدمها لما المستخدم يقول 'لخّصلي الـ Doc ده' أو 'اقرا اللي مكتوب في الملف'.",
  parameters: { type: "object", properties: { document_id: { type: "string", description: "رابط أو ID للـ Doc" }, max_chars: { type: "number", description: "أقصى حروف (افتراضي 50000)" } }, required: ["document_id"] },
  async execute(params) {
    const documentId = extractDocId(String(params.document_id || ""));
    if (!documentId) return { success: false, error: "مش قادر أستخرج document_id." };
    const maxChars = Number(params.max_chars) > 0 ? Number(params.max_chars) : 50000;
    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };
    const url = new URL(`https://docs.googleapis.com/v1/documents/${documentId}`);
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
    if (!resp.ok) return { success: false, error: await formatGoogleError(resp, "documents.get") };
    const doc = (await resp.json()) as DocumentResponse;
    const paragraphs: string[] = [];
    const headings: Array<{ level: string; text: string }> = [];
    for (const el of doc.body?.content ?? []) {
      const para = el.paragraph; if (!para?.elements) continue;
      const text = para.elements.map((e) => e.textRun?.content ?? "").join("").trim();
      if (!text) continue;
      const style = para.paragraphStyle?.namedStyleType;
      if (style && style.startsWith("HEADING_")) headings.push({ level: style, text });
      paragraphs.push(text);
    }
    const fullText = paragraphs.join("\n\n");
    const totalLength = fullText.length;
    const truncated = totalLength > maxChars;
    const text = truncated ? fullText.slice(0, maxChars) : fullText;
    return { success: true, data: { document_id: documentId, title: doc.title ?? "(بدون عنوان)", total_paragraphs: paragraphs.length, total_length: totalLength, returned_length: text.length, truncated, headings, text, link: `https://docs.google.com/document/d/${documentId}/edit`, read_by: auth.user?.email ?? null } };
  },
};
export default googleDocsReaderTool;

import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

type Action = "read" | "append" | "find";
interface DriveFileRaw { id: string; name?: string; modifiedTime?: string; }
interface DriveListResponse { files?: DriveFileRaw[]; }
interface CreatedDoc { documentId: string; }
interface DocElement { paragraph?: { elements?: Array<{ textRun?: { content?: string } }> }; }
interface DocResponse { documentId?: string; title?: string; body?: { content?: DocElement[] }; }

function slugify(topic: string): string {
  const t = String(topic || "").trim().replace(/\s+/g, "_");
  return t.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, "").slice(0, 50) || "default";
}
function memoryFileName(topic: string): string { return `Anzaro_Memory_${slugify(topic)}`; }

export const manageChatMemoryTool: MCPTool = {
  name: "manage_chat_memory",
  description: "ذاكرة مستمرة لكل شات على Google Docs (drive.file + documents). action='read' اقرا الذاكرة، action='append' ضيف سجل، action='find' لقّي/أنشئ ملف الذاكرة. كل موضوع ليه ملفه (Anzaro_Memory_<topic>).",
  parameters: { type: "object", properties: { action: { type: "string", enum: ["read","append","find"], description: "read=اقرا، append=ضيف، find=لقّي" }, topic: { type: "string", description: "موضوع الشات" }, entry: { type: "string", description: "النص اللي يتضاف (لـ append)" }, max_chars: { type: "number", description: "أقصى حروف للقراءة (افتراضي 20000)" } }, required: ["action","topic"] },
  async execute(params) {
    const action = String(params.action || "").trim() as Action;
    const topic = String(params.topic || "").trim();
    if (!["read","append","find"].includes(action)) return { success: false, error: "action لازم تكون read/append/find." };
    if (!topic) return { success: false, error: "topic مطلوب." };
    const entry = String(params.entry || "").trim();
    if (action === "append" && !entry) return { success: false, error: "entry مطلوب لـ append." };
    const maxChars = Number(params.max_chars) > 0 ? Number(params.max_chars) : 20000;
    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };
    const fileName = memoryFileName(topic);
    const headers: Record<string,string> = { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" };

    async function findMemoryDoc(): Promise<DriveFileRaw | null> {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("q", `name='${fileName}' and trashed=false and mimeType='application/vnd.google-apps.document'`);
      url.searchParams.set("fields", "files(id,name,modifiedTime)");
      url.searchParams.set("pageSize", "1");
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error(await formatGoogleError(resp, "drive.files.list"));
      const data = (await resp.json()) as DriveListResponse;
      return data.files?.[0] ?? null;
    }
    async function createMemoryDoc(): Promise<string> {
      const resp = await fetch("https://docs.googleapis.com/v1/documents", { method: "POST", headers, body: JSON.stringify({ title: fileName }) });
      if (!resp.ok) throw new Error(await formatGoogleError(resp, "documents.create"));
      const created = (await resp.json()) as CreatedDoc;
      await fetch(`https://docs.googleapis.com/v1/documents/${created.documentId}:batchUpdate`, { method: "POST", headers, body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: `🧠 ذاكرة الشات: ${topic}\n${"=".repeat(40)}\n\n` } }] }) });
      return created.documentId;
    }
    async function readDoc(documentId: string): Promise<{ text: string; title: string; truncated: boolean }> {
      const resp = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, { headers });
      if (!resp.ok) throw new Error(await formatGoogleError(resp, "documents.get"));
      const doc = (await resp.json()) as DocResponse;
      const paragraphs: string[] = [];
      for (const el of doc.body?.content ?? []) { const t = el.paragraph?.elements?.map((e) => e.textRun?.content ?? "").join("").trim(); if (t) paragraphs.push(t); }
      const full = paragraphs.join("\n");
      const truncated = full.length > maxChars;
      return { text: truncated ? full.slice(0, maxChars) : full, title: doc.title ?? fileName, truncated };
    }
    async function appendEntry(documentId: string, text: string): Promise<void> {
      const doc = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, { headers });
      if (!doc.ok) throw new Error(await formatGoogleError(doc, "documents.get"));
      const body = (await doc.json()) as DocResponse;
      let totalLen = 1;
      for (const el of body.body?.content ?? []) { for (const e of el.paragraph?.elements ?? []) { totalLen += (e.textRun?.content ?? "").length; } }
      const stamp = new Date().toLocaleString("en-GB", { timeZone: "Africa/Cairo" });
      const payload = `\n[${stamp}]\n${text}\n`;
      const resp = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, { method: "POST", headers, body: JSON.stringify({ requests: [{ insertText: { location: { index: totalLen }, text: payload } }] }) });
      if (!resp.ok) throw new Error(await formatGoogleError(resp, "documents.batchUpdate"));
    }

    try {
      let doc = await findMemoryDoc();
      let created = false;
      if (!doc) { const id = await createMemoryDoc(); doc = { id, name: fileName, modifiedTime: new Date().toISOString() }; created = true; }
      if (action === "find") return { success: true, data: { action: "find", topic, file_name: fileName, document_id: doc.id, link: `https://docs.google.com/document/d/${doc.id}/edit`, created_now: created, owner: auth.user?.email ?? null } };
      if (action === "read") { const { text, title, truncated } = await readDoc(doc.id); return { success: true, data: { action: "read", topic, file_name: fileName, document_id: doc.id, title, text, truncated, created_now: created, link: `https://docs.google.com/document/d/${doc.id}/edit`, owner: auth.user?.email ?? null } }; }
      await appendEntry(doc.id, entry);
      return { success: true, data: { action: "append", topic, file_name: fileName, document_id: doc.id, appended_chars: entry.length, created_now: created, link: `https://docs.google.com/document/d/${doc.id}/edit`, owner: auth.user?.email ?? null } };
    } catch (e) { return { success: false, error: e instanceof Error ? e.message : String(e) }; }
  },
};
export default manageChatMemoryTool;

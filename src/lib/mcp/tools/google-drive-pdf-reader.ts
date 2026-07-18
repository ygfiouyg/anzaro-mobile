/**
 * MCP Tool: Google Drive PDF Reader
 * ==================================
 * The Notebook-LM killer. Downloads a PDF directly from the user's Google
 * Drive (via their OAuth access_token — `drive.readonly` scope) and extracts
 * its full text so the assistant can read, summarize, and answer questions
 * about it without the user ever leaving the chat.
 *
 * Auth flow:
 *   1. The tool runs server-side (App Router / API route).
 *   2. It calls `getServerSession(authOptions)` to pull the live Google
 *      access_token out of the NextAuth session.
 *   3. If no session / no token → returns a friendly Arabic error directing
 *      the user to the Integration Dashboard to connect their Google account.
 *
 * Input:
 *   - file_url  OR  file_id   (Google Drive URL or raw file ID)
 *   - max_chars (optional, default 100_000) — soft cap to protect the LLM
 *     context window. Returns `truncated: true` + total length when hit.
 */

import type { MCPTool, MCPToolResult } from "../types";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-nextauth";
import type { Session } from "next-auth";

// pdf-parse is CommonJS; load it lazily inside execute() so it never runs
// during tool-list discovery (keeps registry listing fast + avoids pulling
// pdfjs into every cold start).
type PdfParseFn = (data: Buffer) => Promise<{ text: string; numpages?: number; info?: unknown }>;
let _pdfParse: PdfParseFn | null = null;
async function loadPdfParse(): Promise<PdfParseFn> {
  if (_pdfParse) return _pdfParse;
  // Dynamic import works for both CJS + ESM interop.
  const mod = (await import("pdf-parse")) as unknown as { default?: PdfParseFn } | PdfParseFn;
  _pdfParse = (typeof mod === "function" ? mod : mod.default) ?? (mod as unknown as PdfParseFn);
  if (typeof _pdfParse !== "function") {
    throw new Error("pdf-parse module did not expose a callable function");
  }
  return _pdfParse;
}

// ── Drive URL / ID helpers ────────────────────────────────────────────

/**
 * Accept any of these forms and return the bare file ID:
 *   - https://drive.google.com/file/d/<ID>/view
 *   - https://drive.google.com/open?id=<ID>
 *   - https://docs.google.com/document/d/<ID>/edit        (Docs export to PDF)
 *   - https://drive.google.com/drive/folders/<ID>          (rejected — folder)
 *   - <ID>                                                 (raw id)
 */
function extractFileId(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  // /file/d/<ID>/  or  /document/d/<ID>/  or  /presentation/d/<ID>/
  const m1 = raw.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m1) return m1[1];

  // open?id=<ID>
  const m2 = raw.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m2) return m2[1];

  // raw id — Google Drive IDs are 20+ chars from [A-Za-z0-9_-]
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;

  return null;
}

/** Friendly error payload used when the Google account isn't connected. */
const NOT_CONNECTED_ERROR = `🔒 حساب Google غير مربوط.

لازم تربط حساب Google الأول عشان تقدر تقرا ملفات PDF من الـ Drive.
افتح Integration Dashboard (من قائمة "المزيد" ⟶ "ربط Google Workspace")
واضغط "ربط حساب Google".

بعد الربط، حاول تاني تاني وهتقدر تقرا أي PDF من الـ Drive مباشرة.`;

// ── Session / token extraction ────────────────────────────────────────

interface DriveAuth {
  accessToken: string;
  user?: { email?: string | null; name?: string | null };
}

/**
 * Pull the Google access_token out of the NextAuth session.
 * Returns null if the user isn't authenticated or hasn't connected Google.
 */
async function getDriveAuth(): Promise<DriveAuth | null> {
  let session: Session | null = null;
  try {
    session = await getServerSession(authOptions);
  } catch {
    // getServerSession only works inside an App Router request context.
    // If called outside one (e.g. unit test), it throws — treat as no session.
    return null;
  }
  if (!session?.accessToken) return null;
  return {
    accessToken: session.accessToken,
    user: session.user ? { email: session.user.email, name: session.user.name } : undefined,
  };
}

// ── Drive REST helpers ────────────────────────────────────────────────

interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
}

async function fetchFileMeta(fileId: string, accessToken: string): Promise<DriveFileMeta> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set("fields", "id,name,mimeType,size,webViewLink");
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 401) {
    throw new Error("انتهت صلاحية الـ Google token. افصل واربط حسابك تاني من Integration Dashboard.");
  }
  if (resp.status === 403) {
    throw new Error("Google رفضت الوصول للملف. تأكد إن الملف مشترك مع حسابك أو إن الـ scope شامل drive.readonly.");
  }
  if (resp.status === 404) {
    throw new Error(`الملف غير موجود أو مش متاح لحسابك (id: ${fileId}).`);
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Drive API error ${resp.status}: ${body.slice(0, 200)}`);
  }
  return (await resp.json()) as DriveFileMeta;
}

/** Download the raw file bytes via `alt=media`. */
async function downloadFileBytes(fileId: string, accessToken: string): Promise<Uint8Array> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set("alt", "media");
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Drive download failed ${resp.status}: ${body.slice(0, 200)}`);
  }
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

/** Google Docs/Slides/Sheets → export as PDF first. */
async function exportGoogleDocAsPdf(
  fileId: string,
  mimeType: string,
  accessToken: string,
): Promise<Uint8Array> {
  const exportMime =
    mimeType.includes("document")
      ? "application/pdf"
      : mimeType.includes("presentation")
        ? "application/pdf"
        : mimeType.includes("spreadsheet")
          ? "application/pdf"
          : "application/pdf";
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}/export`);
  url.searchParams.set("mimeType", exportMime);
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Drive export failed ${resp.status}: ${body.slice(0, 200)}`);
  }
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

// ── Chunking ──────────────────────────────────────────────────────────

const DEFAULT_MAX_CHARS = 100_000; // ~25k tokens — safe for GLM-4-Flash 128k window

function chunkText(text: string, maxChars: number): { text: string; truncated: boolean; totalLength: number } {
  const totalLength = text.length;
  if (totalLength <= maxChars) {
    return { text, truncated: false, totalLength };
  }
  // Truncate at the last paragraph/sentence boundary <= maxChars for clean cut.
  const slice = text.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
  const cut = lastBreak > maxChars * 0.6 ? lastBreak : maxChars;
  return { text: text.slice(0, cut), truncated: true, totalLength };
}

// ── The Tool ──────────────────────────────────────────────────────────

export const googleDrivePdfReaderTool: MCPTool = {
  name: "google_drive_pdf_reader",
  description:
    "حمّل واقرا محتوى PDF (أو Google Doc/Sheet/Slides) من Google Drive بتاع المستخدم مباشرة. " +
    'استخدمها لما المستخدم يديك رابط Google Drive أو File ID ويبص يقولك "اقرا/لخص/حلل" الملف ده. ' +
    "بتشتغل بـ OAuth access_token بتاع المستخدم (drive.readonly + drive.file scopes).",

  parameters: {
    type: "object",
    properties: {
      file_url: {
        type: "string",
        description:
          "رابط Google Drive للملف (https://drive.google.com/file/d/.../view) أو open?id=... أو رابط Google Doc/Sheet/Slides.",
      },
      file_id: {
        type: "string",
        description: "الـ File ID مباشرة (بديل لـ file_url).",
      },
      max_chars: {
        type: "number",
        description: "أقصى عدد حروف ترجعها (افتراضي 100000). لو النص أكبر، بترجع truncatد + total_length.",
        default: DEFAULT_MAX_CHARS,
      },
      question: {
        type: "string",
        description: "سؤال اختياري عن الملف — لو موجود، الأداة بترجع نص كمان بس الـ assistant بيجاوب عليه.",
      },
    },
    required: [],
  },

  async execute(params): Promise<MCPToolResult> {
    // ── 1. Resolve file ID ───────────────────────────────────────────
    const fileUrl = String(params.file_url || "").trim();
    const fileIdRaw = String(params.file_id || "").trim();
    const input = fileUrl || fileIdRaw;
    if (!input) {
      return {
        success: false,
        error: "لازم تدي file_url أو file_id للملف من Google Drive.",
      };
    }
    const fileId = extractFileId(input);
    if (!fileId) {
      return {
        success: false,
        error: `مش قادر أستخرج File ID من المدخل: "${input.slice(0, 80)}". تأكد إنه رابط Google Drive صحيح.`,
      };
    }

    // ── 2. Auth — pull access_token from NextAuth session ────────────
    const auth = await getDriveAuth();
    if (!auth) {
      return { success: false, error: NOT_CONNECTED_ERROR };
    }

    // ── 3. Fetch file metadata ───────────────────────────────────────
    let meta: DriveFileMeta;
    try {
      meta = await fetchFileMeta(fileId, auth.accessToken);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }

    // ── 4. Download bytes (raw PDF, or export Google Doc → PDF) ──────
    const isGoogleWorkspaceDoc =
      meta.mimeType.startsWith("application/vnd.google-apps");
    let bytes: Uint8Array;
    try {
      bytes = isGoogleWorkspaceDoc
        ? await exportGoogleDocAsPdf(fileId, meta.mimeType, auth.accessToken)
        : await downloadFileBytes(fileId, auth.accessToken);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }

    // ── 5. Reject non-PDF / unparseable types early ─────────────────
    if (!meta.mimeType.includes("pdf") && !isGoogleWorkspaceDoc) {
      return {
        success: false,
        error: `الملف "${meta.name}" مش PDF (mimeType: ${meta.mimeType}). الأداة دي بتعمل PDF parsing بس.`,
      };
    }

    // ── 6. Parse PDF → text ──────────────────────────────────────────
    let rawText = "";
    let numpages: number | undefined;
    try {
      const parse = await loadPdfParse();
      const result = await parse(Buffer.from(bytes));
      rawText = (result.text || "").trim();
      numpages = result.numpages;
    } catch (e) {
      return {
        success: false,
        error: `فشل الـ PDF parsing: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    if (!rawText) {
      return {
        success: true,
        data: {
          file_id: fileId,
          file_name: meta.name,
          mime_type: meta.mimeType,
          numpages,
          text: "",
          truncated: false,
          total_length: 0,
          note: "الـ PDF نضيف من نص (ممكن يكون صور مسحوبة scan — استخدم analyze_image للـ OCR لو محتاج).",
        },
      };
    }

    // ── 7. Chunk / cap for the LLM context window ────────────────────
    const maxChars = Number(params.max_chars) > 0 ? Number(params.max_chars) : DEFAULT_MAX_CHARS;
    const { text, truncated, totalLength } = chunkText(rawText, maxChars);

    // ── 8. Return structured payload ─────────────────────────────────
    return {
      success: true,
      data: {
        file_id: fileId,
        file_name: meta.name,
        mime_type: meta.mimeType,
        size_bytes: meta.size ? Number(meta.size) : bytes.byteLength,
        numpages,
        text,
        truncated,
        total_length: totalLength,
        returned_length: text.length,
        chunks_remaining: truncated ? Math.ceil((totalLength - text.length) / maxChars) : 0,
        web_view_link: meta.webViewLink,
        owner: auth.user?.email ?? null,
        question: params.question ? String(params.question) : undefined,
        _hint_for_assistant: truncated
          ? `النص اترنش (رجعت ${text.length.toLocaleString()} من ${totalLength.toLocaleString()} حرف). ` +
            `لو محتاج تكمل، نادي الأداة تاني بنفس file_id بس max_chars أكبر، أو اسأل المستخدم لو عايز جزء معين.`
          : undefined,
      },
    };
  },
};

export default googleDrivePdfReaderTool;

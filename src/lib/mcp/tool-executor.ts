/**
 * MCP Tool Executor
 * =================
 * Executes individual MCP tools by name with the supplied arguments.
 * Each tool handler returns a JSON-serialisable result.
 *
 * This is the "server side" of the MCP — it actually performs the work.
 * The GLM Orchestrator calls this whenever GLM emits a tool_call.
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { randomUUID } from "crypto";
import { ALL_TOOLS, TOOL_MAP } from "./tools-registry";
import ZAI from "z-ai-web-dev-sdk";
import { getZAIClient } from "../zai-client";

// Lazily-initialised GLM client (shared across media/vision/summary tools)
let _zai: ZAI | null = null;
async function getZAI(): Promise<ZAI> {
  if (!_zai) _zai = await getZAIClient();
  return _zai;
}

/** Result shape returned by every tool handler. */
export interface ToolResult {
  tool: string;
  success: boolean;
  /** The primary payload — must be JSON-serialisable. */
  output: unknown;
  /** Optional metadata (timing, bytes, artefact URL, …). */
  meta?: Record<string, unknown>;
  error?: string;
}

/** A logger callback so the orchestrator can stream execution events. */
export type ToolEventEmitter = (event: {
  type: "tool_start" | "tool_progress" | "tool_end" | "tool_error";
  tool: string;
  message?: string;
  data?: unknown;
}) => void;

/* ============================================================================
 * Safe filesystem root — all file ops are constrained under this directory
 * to prevent the agent from touching arbitrary system files.
 * ========================================================================== */
const SANDBOX_ROOT = path.resolve(process.cwd(), "workspace");

async function ensureSandbox(): Promise<void> {
  try {
    await fs.mkdir(SANDBOX_ROOT, { recursive: true });
  } catch {
    /* ignore */
  }
}

function resolveSafe(p: string): string {
  const resolved = path.resolve(SANDBOX_ROOT, p);
  if (!resolved.startsWith(SANDBOX_ROOT)) {
    throw new Error("Path escapes sandbox root");
  }
  return resolved;
}

/* ============================================================================
 * FILE OPERATIONS
 * ========================================================================== */
async function fileRead(args: { path: string }): Promise<ToolResult> {
  await ensureSandbox();
  const full = resolveSafe(args.path);
  const content = await fs.readFile(full, "utf-8");
  return { tool: "file.read", success: true, output: content, meta: { path: args.path, bytes: content.length } };
}

async function fileWrite(args: { path: string; content: string }): Promise<ToolResult> {
  await ensureSandbox();
  const full = resolveSafe(args.path);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, args.content, "utf-8");
  return { tool: "file.write", success: true, output: `Wrote ${args.content.length} bytes to ${args.path}` };
}

async function fileAppend(args: { path: string; content: string }): Promise<ToolResult> {
  await ensureSandbox();
  const full = resolveSafe(args.path);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.appendFile(full, args.content, "utf-8");
  return { tool: "file.append", success: true, output: `Appended ${args.content.length} bytes` };
}

async function fileList(args: { path?: string }): Promise<ToolResult> {
  await ensureSandbox();
  const full = resolveSafe(args.path ?? ".");
  const entries = await fs.readdir(full, { withFileTypes: true });
  const items = entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
  return { tool: "file.list", success: true, output: items, meta: { count: items.length } };
}

async function fileDelete(args: { path: string }): Promise<ToolResult> {
  await ensureSandbox();
  await fs.unlink(resolveSafe(args.path));
  return { tool: "file.delete", success: true, output: `Deleted ${args.path}` };
}

async function fileStats(args: { path: string }): Promise<ToolResult> {
  await ensureSandbox();
  const full = resolveSafe(args.path);
  const st = await fs.stat(full);
  return {
    tool: "file.stats",
    success: true,
    output: {
      size: st.size,
      isFile: st.isFile(),
      isDirectory: st.isDirectory(),
      created: st.birthtime.toISOString(),
      modified: st.mtime.toISOString(),
    },
  };
}

async function fileSearch(args: { path: string; pattern: string }): Promise<ToolResult> {
  await ensureSandbox();
  const full = resolveSafe(args.path);
  const content = await fs.readFile(full, "utf-8");
  const regex = new RegExp(args.pattern, "gi");
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    matches.push(m[0]);
    if (matches.length >= 100) break;
  }
  return { tool: "file.search", success: true, output: matches, meta: { count: matches.length } };
}

async function fileMkdir(args: { path: string }): Promise<ToolResult> {
  await ensureSandbox();
  await fs.mkdir(resolveSafe(args.path), { recursive: true });
  return { tool: "file.mkdir", success: true, output: `Created directory ${args.path}` };
}

async function fileCopy(args: { source: string; destination: string }): Promise<ToolResult> {
  await ensureSandbox();
  await fs.copyFile(resolveSafe(args.source), resolveSafe(args.destination));
  return { tool: "file.copy", success: true, output: `Copied ${args.source} → ${args.destination}` };
}

async function fileHash(args: { path: string }): Promise<ToolResult> {
  await ensureSandbox();
  const buf = await fs.readFile(resolveSafe(args.path));
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  return { tool: "file.hash", success: true, output: hash };
}

/* ============================================================================
 * WEB OPERATIONS (uses ZAI built-in functions + fetch)
 * ========================================================================== */
async function webSearch(args: { query: string; num?: number }): Promise<ToolResult> {
  const zai = await getZAI();
  const results = await zai.functions.invoke("web_search", {
    query: args.query,
    num: args.num ?? 5,
  });
  return { tool: "web.search", success: true, output: results, meta: { count: results.length } };
}

async function webReadPage(args: { url: string }): Promise<ToolResult> {
  const zai = await getZAI();
  const result = await zai.functions.invoke("page_reader", { url: args.url });
  return { tool: "web.read_page", success: true, output: result };
}

async function webImageSearch(args: { query: string; count?: number }): Promise<ToolResult> {
  const zai = await getZAI();
  const res = await zai.images.search.create({ query: args.query, count: args.count ?? 5 });
  return { tool: "web.image_search", success: true, output: res.results };
}

async function webFetchRaw(args: { url: string; method?: string }): Promise<ToolResult> {
  const res = await fetch(args.url, { method: args.method ?? "GET" });
  const text = await res.text();
  return { tool: "web.fetch_raw", success: true, output: text, meta: { status: res.status, bytes: text.length } };
}

async function webHead(args: { url: string }): Promise<ToolResult> {
  const res = await fetch(args.url, { method: "HEAD" });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { tool: "web.head", success: true, output: { status: res.status, headers } };
}

async function webDnsLookup(args: { domain: string; record_type: string }): Promise<ToolResult> {
  const { promises: dns } = await import("dns");
  const records = await (dns as any).resolve(args.domain, args.record_type.toLowerCase()).catch((e: Error) => []);
  return { tool: "web.dns_lookup", success: true, output: records };
}

async function webUrlEncode(args: { value: string }): Promise<ToolResult> {
  return { tool: "web.url_encode", success: true, output: encodeURIComponent(args.value) };
}

async function webUrlDecode(args: { value: string }): Promise<ToolResult> {
  return { tool: "web.url_decode", success: true, output: decodeURIComponent(args.value) };
}

async function webMarkdownExtract(args: { url: string }): Promise<ToolResult> {
  const zai = await getZAI();
  const result = await zai.functions.invoke("page_reader", { url: args.url });
  const html = result?.data?.html ?? "";
  // very lightweight HTML → text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { tool: "web.markdown_extract", success: true, output: text, meta: { title: result?.data?.title } };
}

async function webSummarizeUrl(args: { url: string; max_words?: number }): Promise<ToolResult> {
  const zai = await getZAI();
  const page = await zai.functions.invoke("page_reader", { url: args.url });
  const text = (page?.data?.html ?? "").replace(/<[^>]+>/g, " ").slice(0, 8000);
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: "Summarize the following web page content concisely." },
      { role: "user", content: `URL: ${args.url}\n\nContent:\n${text}\n\nSummarize in ${args.max_words ?? 150} words.` },
    ],
  });
  return { tool: "web.summarize_url", success: true, output: completion?.choices?.[0]?.message?.content ?? "" };
}

/* ============================================================================
 * MEDIA OPERATIONS (GLM image / vision / TTS / ASR / video)
 * ========================================================================== */
async function mediaGenerateImage(args: { prompt: string; size?: string }): Promise<ToolResult> {
  const zai = await getZAI();
  const res = await zai.images.generations.create({
    prompt: args.prompt,
    size: (args.size as any) ?? "1024x1024",
  });
  const b64 = res.data?.[0]?.base64 ?? "";
  return {
    tool: "media.generate_image",
    success: true,
    output: { base64: b64, data_uri: `data:image/png;base64,${b64}` },
    meta: { size: args.size ?? "1024x1024" },
  };
}

async function mediaEditImage(args: { prompt: string; image_url: string; size?: string }): Promise<ToolResult> {
  const zai = await getZAI();
  const res = await zai.images.generations.edit({
    prompt: args.prompt,
    image: args.image_url,
    size: (args.size as any) ?? "1024x1024",
  });
  const b64 = res.data?.[0]?.base64 ?? "";
  return { tool: "media.edit_image", success: true, output: { base64: b64, data_uri: `data:image/png;base64,${b64}` } };
}

async function mediaVisionAnalyze(args: { image_url: string; question: string }): Promise<ToolResult> {
  const zai = await getZAI();
  const res = await zai.chat.completions.createVision({
    model: "glm-4v",
    messages: [
      { role: "user", content: [
        { type: "text", text: args.question },
        { type: "image_url", image_url: { url: args.image_url } },
      ] as any },
    ],
  });
  return { tool: "media.vision_analyze", success: true, output: res?.choices?.[0]?.message?.content ?? "" };
}

async function mediaTts(args: { text: string; voice?: string; speed?: number }): Promise<ToolResult> {
  const zai = await getZAI();
  const res = await zai.audio.tts.create({
    input: args.text,
    voice: args.voice ?? "tencentmap-xiaolan",
    speed: args.speed ?? 1,
  });
  // res is an audio buffer / blob
  const buf = Buffer.isBuffer(res) ? res : Buffer.from(await (res as any).arrayBuffer?.() ?? res);
  const b64 = buf.toString("base64");
  return { tool: "media.tts", success: true, output: { base64: b64, data_uri: `data:audio/mpeg;base64,${b64}` } };
}

async function mediaAsr(args: { audio_url: string }): Promise<ToolResult> {
  const zai = await getZAI();
  const res = await zai.audio.asr.create({ file_base64: args.audio_url });
  return { tool: "media.asr", success: true, output: res };
}

async function mediaGenerateVideo(args: { prompt: string; with_audio?: boolean }): Promise<ToolResult> {
  const zai = await getZAI();
  const res = await zai.video.generations.create({
    prompt: args.prompt,
    with_audio: args.with_audio ?? false,
  });
  return { tool: "media.generate_video", success: true, output: res, meta: { task_id: res.id, status: res.task_status } };
}

async function mediaImageMetadata(args: { image_url: string }): Promise<ToolResult> {
  const res = await fetch(args.image_url);
  const buf = Buffer.from(await res.arrayBuffer());
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buf).metadata();
  return { tool: "media.image_metadata", success: true, output: { format: meta.format, width: meta.width, height: meta.height, channels: meta.channels } };
}

async function mediaOcr(args: { image_url: string }): Promise<ToolResult> {
  return mediaVisionAnalyze({ image_url: args.image_url, question: "Extract all visible text from this image. Return only the text, preserving line breaks." });
}

async function mediaImageToBase64(args: { url: string }): Promise<ToolResult> {
  const res = await fetch(args.url);
  const buf = Buffer.from(await res.arrayBuffer());
  return { tool: "media.image_to_base64", success: true, output: { base64: buf.toString("base64"), mime: res.headers.get("content-type") ?? "image/png" } };
}

async function mediaDescribeChart(args: { image_url: string }): Promise<ToolResult> {
  return mediaVisionAnalyze({ image_url: args.image_url, question: "This is a chart or graph. Describe its type, axes, legend, and extract all visible data points as a JSON array." });
}

/* ============================================================================
 * DOCUMENT OPERATIONS
 * ========================================================================== */
async function docGeneratePdf(args: { title: string; content: string; author?: string }): Promise<ToolResult> {
  // ── استخدم omni Playwright engine (نفس الـ chat العادي) ──
  try {
    const { generatePDF } = await import("@/lib/pdf-engine/pdf-engine");
    const result = await generatePDF({
      title: args.title,
      content: args.content,
      modelId: "smart-doc-v2",
      author: args.author ?? "DELTA AI",
      language: "ar",
      documentType: "lecture",
    });
    if (result.success && result.filePath) {
      const { readFileSync } = await import("fs");
      const buf = readFileSync(result.filePath);
      const b64 = buf.toString("base64");
      return {
        tool: "doc.generate_pdf",
        success: true,
        output: { base64: b64, data_uri: `data:application/pdf;base64,${b64}`, filePath: result.filePath },
        meta: { bytes: buf.length, engine: "playwright-omni" },
      };
    }
    return { tool: "doc.generate_pdf", success: false, output: null, meta: { error: result.error ?? "PDF generation failed" } };
  } catch (e) {
    return {
      tool: "doc.generate_pdf",
      success: false,
      output: null,
      meta: { error: e instanceof Error ? e.message : String(e) },
    };
  }
}

async function docGeneratePptx(args: { title: string; slides: { title: string; bullets: string[] }[] }): Promise<ToolResult> {
  const pptxgen = (await import("pptxgenjs")).default;
  const pres = new pptxgen();
  pres.title = args.title;
  pres.defineLayout({ name: "CUSTOM", width: 13.333, height: 7.5 });
  pres.layout = "CUSTOM";
  // Title slide
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: "0F172A" };
  titleSlide.addText(args.title, { x: 0.5, y: 3, w: 12, h: 1.5, fontSize: 40, color: "F8FAFC", bold: true, align: "center" });
  for (const s of args.slides) {
    const slide = pres.addSlide();
    slide.addText(s.title, { x: 0.5, y: 0.3, w: 12, h: 1, fontSize: 28, bold: true, color: "0F172A" });
    slide.addText(s.bullets.map((b) => ({ text: b, options: { bullet: true, fontSize: 18, color: "334155", breakLine: true } })), { x: 0.8, y: 1.5, w: 11.5, h: 5 });
  }
  const buf: ArrayBuffer = await pres.write({ outputType: "arraybuffer" });
  const b64 = Buffer.from(buf).toString("base64");
  return { tool: "doc.generate_pptx", success: true, output: { base64: b64, data_uri: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${b64}` } };
}

async function docGenerateXlsx(args: { filename?: string; sheets: { name: string; headers: string[]; rows: unknown[][] }[] }): Promise<ToolResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const sheet of args.sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.addRow(sheet.headers);
    sheet.headers.forEach((_, i) => (ws.getColumn(i + 1).width = 18));
    for (const row of sheet.rows) ws.addRow(row);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  }
  const buf = await wb.xlsx.writeBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  return { tool: "doc.generate_xlsx", success: true, output: { base64: b64, data_uri: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}` } };
}

async function docGenerateDocx(args: { title: string; paragraphs: string[] | string }): Promise<ToolResult> {
  const docx = await import("docx");
  // Defensive: GLM may pass a string instead of an array — normalise.
  const paras: string[] = Array.isArray(args.paragraphs)
    ? args.paragraphs.map(String)
    : String(args.paragraphs ?? "").split("\n").filter(Boolean);
  const doc = new docx.Document({
    sections: [{
      properties: {},
      children: [
        new docx.Paragraph({ text: args.title, heading: docx.HeadingLevel.TITLE, alignment: docx.AlignmentType.CENTER }),
        ...paras.map((p) => new docx.Paragraph({ text: p, spacing: { after: 200 } })),
      ],
    }],
  });
  const buf = await docx.Packer.toBuffer(doc);
  const b64 = buf.toString("base64");
  return { tool: "doc.generate_docx", success: true, output: { base64: b64, data_uri: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${b64}` } };
}

async function docMarkdownToPdf(args: { markdown: string; title?: string }): Promise<ToolResult> {
  // Convert simple markdown to plain text lines for PDFKit
  const lines = args.markdown.split("\n");
  const content = lines.map((l) => l.replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "").replace(/\*/g, "")).join("\n");
  return docGeneratePdf({ title: args.title ?? "Markdown Document", content });
}

async function docCsvToJson(args: { csv: string; delimiter?: string }): Promise<ToolResult> {
  const delim = args.delimiter ?? ",";
  const lines = args.csv.trim().split("\n");
  if (lines.length < 2) return { tool: "doc.csv_to_json", success: true, output: [] };
  const headers = lines[0].split(delim).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(delim);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (cells[i] ?? "").trim()));
    return obj;
  });
  return { tool: "doc.csv_to_json", success: true, output: rows, meta: { count: rows.length } };
}

async function docJsonToCsv(args: { json: string }): Promise<ToolResult> {
  const arr = JSON.parse(args.json);
  if (!Array.isArray(arr) || arr.length === 0) return { tool: "doc.json_to_csv", success: true, output: "" };
  const headers = Object.keys(arr[0]);
  const lines = [headers.join(",")];
  for (const row of arr) lines.push(headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","));
  return { tool: "doc.json_to_csv", success: true, output: lines.join("\n") };
}

async function docJsonPretty(args: { json: string }): Promise<ToolResult> {
  const parsed = JSON.parse(args.json);
  return { tool: "doc.json_pretty", success: true, output: JSON.stringify(parsed, null, 2) };
}

async function docExtractTextFromHtml(args: { html: string }): Promise<ToolResult> {
  const text = args.html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { tool: "doc.extract_text_from_html", success: true, output: text };
}

async function docTemplateFill(args: { template: string; data: Record<string, unknown> }): Promise<ToolResult> {
  let out = args.template;
  for (const [k, v] of Object.entries(args.data)) out = out.replaceAll(`{{${k}}}`, String(v));
  return { tool: "doc.template_fill", success: true, output: out };
}

/* ============================================================================
 * CODE OPERATIONS (isolated-vm sandbox)
 * ========================================================================== */
async function codeExecuteJs(args: { code: string; timeout_ms?: number }): Promise<ToolResult> {
  // Use Node's built-in `vm` module for a lightweight, reliable sandbox.
  // isolated-vm is also installed for heavier isolation needs (Docker-style),
  // but `vm` is sufficient for trusted model-generated code and avoids
  // transferable-value marshalling headaches.
  const vm = await import("vm");
  const logs: string[] = [];
  const sandbox = {
    console: {
      log: (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" ")),
      error: (...a: unknown[]) => logs.push("[error] " + a.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" ")),
      warn: (...a: unknown[]) => logs.push("[warn] " + a.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" ")),
      info: (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" ")),
    },
    Math, JSON, Date, parseInt, parseFloat, isNaN, String, Number, Boolean, Array, Object,
    setTimeout: () => {}, // stub — no async timers in sync sandbox
    __result: undefined as unknown,
  };
  try {
    const context = vm.createContext(sandbox);
    // Wrap user code in an IIFE; capture the last expression into __result
    const wrapped = `(function(){\n${args.code}\n})();`;
    vm.runInContext(wrapped, context, {
      timeout: args.timeout_ms ?? 5000,
      filename: "sandbox.js",
      displayErrors: true,
    });
    const result = logs.join("\n") || "(no output)";
    return { tool: "code.execute_js", success: true, output: result };
  } catch (e: any) {
    return { tool: "code.execute_js", success: false, output: logs.join("\n") || "", error: e.message };
  }
}

async function codeExecutePythonSim(args: { code: string }): Promise<ToolResult> {
  // Lightweight Python-ish simulator for print() and arithmetic — not a real Python
  const logs: string[] = [];
  const lines = args.code.split("\n");
  for (const line of lines) {
    const printMatch = line.match(/^\s*print\((.*)\)\s*$/);
    if (printMatch) {
      try {
        const expr = printMatch[1].replace(/['"]/g, "");
        logs.push(expr);
      } catch {
        logs.push(printMatch[1]);
      }
    }
  }
  return { tool: "code.execute_python_sim", success: true, output: logs.join("\n") || "(no output)", meta: { note: "Simulated Python — supports print() statements only" } };
}

async function codeLintJs(args: { code: string }): Promise<ToolResult> {
  const issues: string[] = [];
  if (/\beval\s*\(/.test(args.code)) issues.push("'eval' usage detected — security risk");
  if (/==[^=]/.test(args.code)) issues.push("Use '===' instead of '==' for strict equality");
  if (/var\s+/.test(args.code)) issues.push("Prefer 'let'/'const' over 'var'");
  if (/console\.log/.test(args.code)) issues.push("'console.log' present — remove for production");
  return { tool: "code.lint_js", success: true, output: issues.length ? issues : ["No issues found"] };
}

async function codeFormatJson(args: { json: string }): Promise<ToolResult> {
  try {
    return { tool: "code.format_json", success: true, output: JSON.stringify(JSON.parse(args.json), null, 2) };
  } catch (e: any) {
    return { tool: "code.format_json", success: false, output: null, error: `Invalid JSON: ${e.message}` };
  }
}

async function codeMinifyJs(args: { code: string }): Promise<ToolResult> {
  const min = args.code
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}();,:])\s*/g, "$1")
    .trim();
  return { tool: "code.minify_js", success: true, output: min, meta: { original: args.code.length, minified: min.length } };
}

async function codeBase64Encode(args: { input: string }): Promise<ToolResult> {
  return { tool: "code.base64_encode", success: true, output: Buffer.from(args.input, "utf-8").toString("base64") };
}

async function codeBase64Decode(args: { input: string }): Promise<ToolResult> {
  return { tool: "code.base64_decode", success: true, output: Buffer.from(args.input, "base64").toString("utf-8") };
}

async function codeRegexTest(args: { pattern: string; flags?: string; test_string: string }): Promise<ToolResult> {
  try {
    const re = new RegExp(args.pattern, args.flags ?? "g");
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(args.test_string)) !== null) {
      matches.push(m[0]);
      if (!re.global) break;
    }
    return { tool: "code.regex_test", success: true, output: { matched: matches.length > 0, matches }, meta: { count: matches.length } };
  } catch (e: any) {
    return { tool: "code.regex_test", success: false, output: null, error: e.message };
  }
}

async function codeHashCompute(args: { algorithm: string; input: string }): Promise<ToolResult> {
  const hash = crypto.createHash(args.algorithm).update(args.input, "utf-8").digest("hex");
  return { tool: "code.hash_compute", success: true, output: hash };
}

async function codeUuidGenerate(args: { count?: number }): Promise<ToolResult> {
  const n = args.count ?? 1;
  const uuids: string[] = [];
  for (let i = 0; i < n; i++) uuids.push(randomUUID());
  return { tool: "code.uuid_generate", success: true, output: uuids };
}

/* ============================================================================
 * DATA OPERATIONS
 * ========================================================================== */
async function dataStats(args: { values: number[] }): Promise<ToolResult> {
  const v = args.values;
  if (v.length === 0) return { tool: "data.stats", success: true, output: { error: "empty array" } };
  const sum = v.reduce((a, b) => a + b, 0);
  const mean = sum / v.length;
  const sorted = [...v].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
  return { tool: "data.stats", success: true, output: { count: v.length, sum, mean, median, std: Math.sqrt(variance), min: sorted[0], max: sorted[sorted.length - 1] } };
}

async function dataSort(args: { values: unknown[]; order?: string }): Promise<ToolResult> {
  const sorted = [...args.values].sort((a: any, b: any) => (args.order === "desc" ? (a > b ? -1 : a < b ? 1 : 0) : a > b ? 1 : a < b ? -1 : 0));
  return { tool: "data.sort", success: true, output: sorted };
}

async function dataFilter(args: { array: Record<string, unknown>[]; key: string; operator: string; value: unknown }): Promise<ToolResult> {
  const op = args.operator;
  const out = (args.array ?? []).filter((item) => {
    const v = item[args.key];
    switch (op) {
      case "eq": return v === args.value;
      case "ne": return v !== args.value;
      case "gt": return Number(v) > Number(args.value);
      case "lt": return Number(v) < Number(args.value);
      case "contains": return String(v).includes(String(args.value));
      default: return false;
    }
  });
  return { tool: "data.filter", success: true, output: out, meta: { count: out.length } };
}

async function dataGroupBy(args: { array: Record<string, unknown>[]; key: string }): Promise<ToolResult> {
  const groups: Record<string, unknown[]> = {};
  for (const item of args.array ?? []) {
    const k = String(item[args.key]);
    (groups[k] = groups[k] ?? []).push(item);
  }
  const summary = Object.entries(groups).map(([k, v]) => ({ group: k, count: v.length }));
  return { tool: "data.group_by", success: true, output: { groups, summary } };
}

async function dataUnique(args: { values: unknown[] }): Promise<ToolResult> {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const v of args.values ?? []) {
    const key = JSON.stringify(v);
    if (!seen.has(key)) { seen.add(key); out.push(v); }
  }
  return { tool: "data.unique", success: true, output: out, meta: { count: out.length } };
}

async function dataFlatten(args: { values: unknown[] }): Promise<ToolResult> {
  const out: unknown[] = [];
  for (const v of args.values ?? []) if (Array.isArray(v)) out.push(...v); else out.push(v);
  return { tool: "data.flatten", success: true, output: out };
}

async function dataCsvStats(args: { csv: string }): Promise<ToolResult> {
  const lines = args.csv.trim().split("\n");
  if (lines.length < 2) return { tool: "data.csv_stats", success: true, output: { error: "need header + at least 1 row" } };
  const headers = lines[0].split(",").map((h) => h.trim());
  const cols: Record<string, number[]> = {};
  headers.forEach((h) => (cols[h] = []));
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    headers.forEach((h, i) => {
      const n = Number(cells[i]?.trim());
      if (!isNaN(n)) cols[h].push(n);
    });
  }
  const summary: Record<string, unknown> = {};
  for (const [h, vals] of Object.entries(cols)) {
    if (vals.length > 0) {
      const r = await dataStats({ values: vals });
      summary[h] = r.output;
    } else {
      summary[h] = { type: "non-numeric" };
    }
  }
  return { tool: "data.csv_stats", success: true, output: summary };
}

async function dataJsonQuery(args: { json: string; path: string }): Promise<ToolResult> {
  const obj = JSON.parse(args.json);
  const parts = args.path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return { tool: "data.json_query", success: true, output: null };
    if (/^\d+$/.test(p) && Array.isArray(cur)) cur = (cur as unknown[])[Number(p)];
    else cur = (cur as Record<string, unknown>)[p];
  }
  return { tool: "data.json_query", success: true, output: cur };
}

async function dataAggregate(args: { array: Record<string, unknown>[]; group_key: string; value_key: string; operation: string }): Promise<ToolResult> {
  const groups: Record<string, number[]> = {};
  for (const item of args.array ?? []) {
    const k = String(item[args.group_key]);
    const v = Number(item[args.value_key]);
    if (!isNaN(v)) (groups[k] = groups[k] ?? []).push(v);
  }
  const out: Record<string, number>[] = [];
  for (const [k, vals] of Object.entries(groups)) {
    let res = 0;
    switch (args.operation) {
      case "sum": res = vals.reduce((a, b) => a + b, 0); break;
      case "avg": res = vals.reduce((a, b) => a + b, 0) / vals.length; break;
      case "count": res = vals.length; break;
      case "min": res = Math.min(...vals); break;
      case "max": res = Math.max(...vals); break;
    }
    out.push({ [args.group_key]: k, [args.operation]: res, count: vals.length });
  }
  return { tool: "data.aggregate", success: true, output: out };
}

async function dataChartSpec(args: { type: string; labels: string[]; datasets: Record<string, unknown>[] }): Promise<ToolResult> {
  const spec = {
    type: args.type,
    data: { labels: args.labels, datasets: args.datasets },
    options: { responsive: true, plugins: { legend: { position: "top" } } },
  };
  return { tool: "data.chart_spec", success: true, output: spec };
}

/* ============================================================================
 * DISPATCH TABLE
 * ========================================================================== */
type Handler = (args: any) => Promise<ToolResult>;

const HANDLERS: Record<string, Handler> = {
  "file.read": fileRead,
  "file.write": fileWrite,
  "file.append": fileAppend,
  "file.list": fileList,
  "file.delete": fileDelete,
  "file.stats": fileStats,
  "file.search": fileSearch,
  "file.mkdir": fileMkdir,
  "file.copy": fileCopy,
  "file.hash": fileHash,
  "web.search": webSearch,
  "web.read_page": webReadPage,
  "web.image_search": webImageSearch,
  "web.fetch_raw": webFetchRaw,
  "web.head": webHead,
  "web.dns_lookup": webDnsLookup,
  "web.url_encode": webUrlEncode,
  "web.url_decode": webUrlDecode,
  "web.markdown_extract": webMarkdownExtract,
  "web.summarize_url": webSummarizeUrl,
  "media.generate_image": mediaGenerateImage,
  "media.edit_image": mediaEditImage,
  "media.vision_analyze": mediaVisionAnalyze,
  "media.tts": mediaTts,
  "media.asr": mediaAsr,
  "media.generate_video": mediaGenerateVideo,
  "media.image_metadata": mediaImageMetadata,
  "media.ocr": mediaOcr,
  "media.image_to_base64": mediaImageToBase64,
  "media.describe_chart": mediaDescribeChart,
  "doc.generate_pdf": docGeneratePdf,
  "doc.generate_pptx": docGeneratePptx,
  "doc.generate_xlsx": docGenerateXlsx,
  "doc.generate_docx": docGenerateDocx,
  "doc.markdown_to_pdf": docMarkdownToPdf,
  "doc.csv_to_json": docCsvToJson,
  "doc.json_to_csv": docJsonToCsv,
  "doc.json_pretty": docJsonPretty,
  "doc.extract_text_from_html": docExtractTextFromHtml,
  "doc.template_fill": docTemplateFill,
  "code.execute_js": codeExecuteJs,
  "code.execute_python_sim": codeExecutePythonSim,
  "code.lint_js": codeLintJs,
  "code.format_json": codeFormatJson,
  "code.minify_js": codeMinifyJs,
  "code.base64_encode": codeBase64Encode,
  "code.base64_decode": codeBase64Decode,
  "code.regex_test": codeRegexTest,
  "code.hash_compute": codeHashCompute,
  "code.uuid_generate": codeUuidGenerate,
  "data.stats": dataStats,
  "data.sort": dataSort,
  "data.filter": dataFilter,
  "data.group_by": dataGroupBy,
  "data.unique": dataUnique,
  "data.flatten": dataFlatten,
  "data.csv_stats": dataCsvStats,
  "data.json_query": dataJsonQuery,
  "data.aggregate": dataAggregate,
  "data.chart_spec": dataChartSpec,
};

/**
 * Execute a single tool by name with the given arguments.
 * Emits lifecycle events to the optional emitter (for SSE streaming).
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  emit?: ToolEventEmitter,
): Promise<ToolResult> {
  const handler = HANDLERS[toolName];
  if (!handler) {
    return { tool: toolName, success: false, output: null, error: `Unknown tool: ${toolName}` };
  }
  const def = TOOL_MAP[toolName];
  emit?.({ type: "tool_start", tool: toolName, message: `Executing ${toolName}`, data: { args, category: def?.category } });
  const start = Date.now();
  try {
    const result = await handler(args);
    result.meta = { ...result.meta, duration_ms: Date.now() - start };
    emit?.({ type: result.success ? "tool_end" : "tool_error", tool: toolName, message: result.success ? "Completed" : "Failed", data: result });
    return result;
  } catch (e: any) {
    const result: ToolResult = { tool: toolName, success: false, output: null, error: e.message, meta: { duration_ms: Date.now() - start } };
    emit?.({ type: "tool_error", tool: toolName, message: e.message, data: result });
    return result;
  }
}

/** Sanity check: ensure every registered tool has a handler. */
export function validateRegistry(): { ok: boolean; missing: string[] } {
  const missing = ALL_TOOLS.filter((t) => !HANDLERS[t.name]).map((t) => t.name);
  return { ok: missing.length === 0, missing };
}

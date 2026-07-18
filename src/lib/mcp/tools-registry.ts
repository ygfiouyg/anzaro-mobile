/**
 * MCP Tools Registry — 60 Specialized Workers
 * =============================================
 * Defines all available tools exposed via the MCP (Model Context Protocol) layer.
 * Each tool follows the MCP/JSON-Schema tool definition standard so it can be
 * (a) advertised to GLM as a callable function, and
 * (b) executed by the Tool Executor.
 *
 * Tools are organized into 6 categories of 10 tools each = 60 workers total:
 *   1. FILE_OPS     — File system operations
 *   2. WEB          — Web search & content extraction
 *   3. MEDIA        — Image generation, editing, vision
 *   4. DOCUMENTS    — PDF / PPTX / XLSX / DOCX generation
 *   5. CODE         — Code execution & analysis sandbox
 *   6. DATA         — Data transformation & computation
 */

export type ToolCategory =
  | "file_ops"
  | "web"
  | "media"
  | "documents"
  | "code"
  | "data";

export interface MCPTool {
  /** Unique tool name, e.g. "file.read" */
  name: string;
  /** Human-readable description shown to GLM */
  description: string;
  /** Category for grouping in the UI */
  category: ToolCategory;
  /** JSON-Schema for the parameters GLM must supply */
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Helper to keep tool definitions terse.
 */
const t = (
  name: string,
  description: string,
  category: ToolCategory,
  properties: Record<string, unknown>,
  required?: string[],
): MCPTool => ({
  name,
  description,
  category,
  inputSchema: { type: "object", properties, required },
});

/* ============================================================================
 * 1. FILE OPERATIONS (10 tools)
 * ========================================================================== */
const FILE_OPS: MCPTool[] = [
  t("file.read", "Read the contents of a text file from the server filesystem.", "file_ops",
    { path: { type: "string", description: "Absolute or relative path to the file." } }, ["path"]),
  t("file.write", "Write text content to a file (creates or overwrites).", "file_ops",
    { path: { type: "string" }, content: { type: "string" } }, ["path", "content"]),
  t("file.append", "Append text to an existing file.", "file_ops",
    { path: { type: "string" }, content: { type: "string" } }, ["path", "content"]),
  t("file.list", "List files and directories in a folder.", "file_ops",
    { path: { type: "string", description: "Directory path. Defaults to current dir." } }),
  t("file.delete", "Delete a file from the filesystem.", "file_ops",
    { path: { type: "string" } }, ["path"]),
  t("file.stats", "Get file metadata: size, created, modified, type.", "file_ops",
    { path: { type: "string" } }, ["path"]),
  t("file.search", "Search file contents for a pattern (regex supported).", "file_ops",
    { path: { type: "string" }, pattern: { type: "string" } }, ["path", "pattern"]),
  t("file.mkdir", "Create a directory (and parents if needed).", "file_ops",
    { path: { type: "string" } }, ["path"]),
  t("file.copy", "Copy a file from source to destination.", "file_ops",
    { source: { type: "string" }, destination: { type: "string" } }, ["source", "destination"]),
  t("file.hash", "Compute SHA-256 hash of a file.", "file_ops",
    { path: { type: "string" } }, ["path"]),
];

/* ============================================================================
 * 2. WEB (10 tools)
 * ========================================================================== */
const WEB: MCPTool[] = [
  t("web.search", "Search the web for real-time information and return ranked results.", "web",
    { query: { type: "string" }, num: { type: "number", description: "Number of results (default 5)." } }, ["query"]),
  t("web.read_page", "Fetch and extract clean readable content from any URL.", "web",
    { url: { type: "string" } }, ["url"]),
  t("web.image_search", "Search the web for images matching a query.", "web",
    { query: { type: "string" }, count: { type: "number" } }, ["query"]),
  t("web.fetch_raw", "Fetch raw HTML/JSON from a URL (no parsing).", "web",
    { url: { type: "string" }, method: { type: "string", enum: ["GET", "POST"] } }, ["url"]),
  t("web.head", "Send HEAD request to get headers without body.", "web",
    { url: { type: "string" } }, ["url"]),
  t("web.dns_lookup", "Resolve DNS records for a domain.", "web",
    { domain: { type: "string" }, record_type: { type: "string", enum: ["A", "AAAA", "MX", "TXT", "CNAME", "NS"] } }, ["domain"]),
  t("web.url_encode", "Percent-encode a URL component.", "web",
    { value: { type: "string" } }, ["value"]),
  t("web.url_decode", "Percent-decode a URL component.", "web",
    { value: { type: "string" } }, ["value"]),
  t("web.markdown_extract", "Convert fetched HTML into clean Markdown.", "web",
    { url: { type: "string" } }, ["url"]),
  t("web.summarize_url", "Fetch a URL and produce a concise summary.", "web",
    { url: { type: "string" }, max_words: { type: "number" } }, ["url"]),
];

/* ============================================================================
 * 3. MEDIA (10 tools)
 * ========================================================================== */
const MEDIA: MCPTool[] = [
  t("media.generate_image", "Generate an AI image from a text prompt (GLM image model).", "media",
    { prompt: { type: "string" }, size: { type: "string", enum: ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"] } }, ["prompt"]),
  t("media.edit_image", "Edit an existing image with a text instruction.", "media",
    { prompt: { type: "string" }, image_url: { type: "string", description: "URL or base64 data URI of source image." }, size: { type: "string" } }, ["prompt", "image_url"]),
  t("media.vision_analyze", "Analyze/describe an image using the GLM vision model.", "media",
    { image_url: { type: "string" }, question: { type: "string", description: "What to ask about the image." } }, ["image_url", "question"]),
  t("media.tts", "Convert text to natural-sounding speech audio.", "media",
    { text: { type: "string" }, voice: { type: "string" }, speed: { type: "number" } }, ["text"]),
  t("media.asr", "Transcribe audio speech to text.", "media",
    { audio_url: { type: "string", description: "URL or base64 of audio file." } }, ["audio_url"]),
  t("media.generate_video", "Generate an AI video from a prompt (async task).", "media",
    { prompt: { type: "string" }, with_audio: { type: "boolean" } }, ["prompt"]),
  t("media.image_metadata", "Extract dimensions and format from an image URL/base64.", "media",
    { image_url: { type: "string" } }, ["image_url"]),
  t("media.ocr", "Run OCR text extraction on an image (via vision model).", "media",
    { image_url: { type: "string" } }, ["image_url"]),
  t("media.image_to_base64", "Download an image and return its base64 representation.", "media",
    { url: { type: "string" } }, ["url"]),
  t("media.describe_chart", "Analyze a chart/graph image and extract its data points.", "media",
    { image_url: { type: "string" } }, ["image_url"]),
];

/* ============================================================================
 * 4. DOCUMENTS (10 tools)
 * ========================================================================== */
const DOCUMENTS: MCPTool[] = [
  t("doc.generate_pdf", "Generate a PDF document from text/markdown content.", "documents",
    { title: { type: "string" }, content: { type: "string" }, author: { type: "string" } }, ["title", "content"]),
  t("doc.generate_pptx", "Generate a PowerPoint presentation from slide definitions.", "documents",
    { title: { type: "string" }, slides: { type: "array", items: { type: "object", properties: { title: { type: "string" }, bullets: { type: "array", items: { type: "string" } } } } } }, ["title", "slides"]),
  t("doc.generate_xlsx", "Generate an Excel spreadsheet from rows of data.", "documents",
    { filename: { type: "string" }, sheets: { type: "array", items: { type: "object", properties: { name: { type: "string" }, headers: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "array" } } } } } }, ["sheets"]),
  t("doc.generate_docx", "Generate a Word document from structured content.", "documents",
    { title: { type: "string" }, paragraphs: { type: "array", items: { type: "string" } } }, ["title", "paragraphs"]),
  t("doc.markdown_to_pdf", "Convert Markdown text into a styled PDF.", "documents",
    { markdown: { type: "string" }, title: { type: "string" } }, ["markdown"]),
  t("doc.csv_to_json", "Parse CSV text into a JSON array of objects.", "documents",
    { csv: { type: "string" }, delimiter: { type: "string", default: "," } }, ["csv"]),
  t("doc.json_to_csv", "Convert a JSON array of objects into CSV text.", "documents",
    { json: { type: "string", description: "JSON array as string." } }, ["json"]),
  t("doc.json_pretty", "Pretty-print / validate a JSON string.", "documents",
    { json: { type: "string" } }, ["json"]),
  t("doc.extract_text_from_html", "Strip HTML tags and return plain text.", "documents",
    { html: { type: "string" } }, ["html"]),
  t("doc.template_fill", "Fill a {{mustache}} template with key-value data.", "documents",
    { template: { type: "string" }, data: { type: "object" } }, ["template", "data"]),
];

/* ============================================================================
 * 5. CODE (10 tools)
 * ========================================================================== */
const CODE: MCPTool[] = [
  t("code.execute_js", "Execute JavaScript/TypeScript code in an isolated sandbox and return output.", "code",
    { code: { type: "string" }, timeout_ms: { type: "number", default: 5000 } }, ["code"]),
  t("code.execute_python_sim", "Simulate Python execution (transpiles basic expressions) in sandbox.", "code",
    { code: { type: "string" } }, ["code"]),
  t("code.lint_js", "Static analysis of JavaScript code for common issues.", "code",
    { code: { type: "string" } }, ["code"]),
  t("code.format_json", "Format and validate a JSON string with indentation.", "code",
    { json: { type: "string" } }, ["json"]),
  t("code.minify_js", "Basic JavaScript minification (strip comments/whitespace).", "code",
    { code: { type: "string" } }, ["code"]),
  t("code.base64_encode", "Encode a string to base64.", "code",
    { input: { type: "string" } }, ["input"]),
  t("code.base64_decode", "Decode a base64 string.", "code",
    { input: { type: "string" } }, ["input"]),
  t("code.regex_test", "Test a regex pattern against a string and return matches.", "code",
    { pattern: { type: "string" }, flags: { type: "string" }, test_string: { type: "string" } }, ["pattern", "test_string"]),
  t("code.hash_compute", "Compute a cryptographic hash (md5/sha1/sha256) of input text.", "code",
    { algorithm: { type: "string", enum: ["md5", "sha1", "sha256"] }, input: { type: "string" } }, ["algorithm", "input"]),
  t("code.uuid_generate", "Generate one or more UUIDs (v4).", "code",
    { count: { type: "number", default: 1 } }),
];

/* ============================================================================
 * 6. DATA (10 tools)
 * ========================================================================== */
const DATA: MCPTool[] = [
  t("data.stats", "Compute descriptive statistics (mean, median, std, min, max) for a numeric array.", "data",
    { values: { type: "array", items: { type: "number" } } }, ["values"]),
  t("data.sort", "Sort an array of values ascending or descending.", "data",
    { values: { type: "array" }, order: { type: "string", enum: ["asc", "desc"] } }, ["values"]),
  t("data.filter", "Filter an array of objects by a key=value condition.", "data",
    { array: { type: "array" }, key: { type: "string" }, operator: { type: "string", enum: ["eq", "ne", "gt", "lt", "contains"] }, value: {} }, ["array", "key", "operator", "value"]),
  t("data.group_by", "Group an array of objects by a key and count/aggregate.", "data",
    { array: { type: "array" }, key: { type: "string" } }, ["array", "key"]),
  t("data.unique", "Return unique values from an array.", "data",
    { values: { type: "array" } }, ["values"]),
  t("data.flatten", "Flatten a nested array by one level.", "data",
    { values: { type: "array" } }, ["values"]),
  t("data.csv_stats", "Compute summary statistics for each column of a CSV.", "data",
    { csv: { type: "string" } }, ["csv"]),
  t("data.json_query", "Run a simple JSONPath-style query on a JSON object.", "data",
    { json: { type: "string" }, path: { type: "string", description: "Dot-path, e.g. 'users.0.name'" } }, ["json", "path"]),
  t("data.aggregate", "Aggregate numeric values by a grouping key (sum/avg/count).", "data",
    { array: { type: "array" }, group_key: { type: "string" }, value_key: { type: "string" }, operation: { type: "string", enum: ["sum", "avg", "count", "min", "max"] } }, ["array", "group_key", "value_key", "operation"]),
  t("data.chart_spec", "Build a Chart.js-compatible spec from a dataset for visualization.", "data",
    { type: { type: "string", enum: ["bar", "line", "pie", "doughnut"] }, labels: { type: "array", items: { type: "string" } }, datasets: { type: "array", items: { type: "object" } } }, ["type", "labels", "datasets"]),
];

/**
 * The complete registry of 60 MCP tools.
 */
export const ALL_TOOLS: MCPTool[] = [
  ...FILE_OPS,
  ...WEB,
  ...MEDIA,
  ...DOCUMENTS,
  ...CODE,
  ...DATA,
];

/** Quick lookup map by tool name. */
export const TOOL_MAP: Record<string, MCPTool> = Object.fromEntries(
  ALL_TOOLS.map((tool) => [tool.name, tool]),
);

/** Get tools filtered by category. */
export function toolsByCategory(category: ToolCategory): MCPTool[] {
  return ALL_TOOLS.filter((tool) => tool.category === category);
}

/** Category metadata for UI rendering. */
export const CATEGORY_META: Record<
  ToolCategory,
  { label: string; icon: string; color: string; description: string }
> = {
  file_ops: {
    label: "File Operations",
    icon: "FolderTree",
    color: "amber",
    description: "Read, write, search and manage files on the server.",
  },
  web: {
    label: "Web & Search",
    icon: "Globe",
    color: "emerald",
    description: "Search the internet and extract content from any URL.",
  },
  media: {
    label: "Media & Vision",
    icon: "Image",
    color: "pink",
    description: "Generate images, video, speech and analyze visual content.",
  },
  documents: {
    label: "Documents",
    icon: "FileText",
    color: "sky",
    description: "Produce PDF, PowerPoint, Excel and Word documents.",
  },
  code: {
    label: "Code & Sandbox",
    icon: "Code2",
    color: "violet",
    description: "Execute code safely and transform text programmatically.",
  },
  data: {
    label: "Data & Analytics",
    icon: "Database",
    color: "rose",
    description: "Compute statistics, filter, group and chart datasets.",
  },
};

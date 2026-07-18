/**
 * Agent Tool Catalog
 * ==================
 * قائمة الأدوات اللي المستخدم يقدر يختار منها لوكيله المخصص.
 * كل أداة ليها: name, description, category, icon, parameters (JSON-Schema for GLM).
 *
 * الـ executor بيـ map اسم الأداة → implementation حقيقية.
 */

export type ToolCategory =
  | "search"
  | "content"
  | "code"
  | "data"
  | "communication"
  | "utility"
  | "ai"
  | "mcp";

export interface AgentToolDef {
  name: string;
  description: string;
  category: ToolCategory;
  icon: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const t = (
  name: string,
  description: string,
  category: ToolCategory,
  icon: string,
  properties: Record<string, unknown>,
  required?: string[],
): AgentToolDef => ({
  name,
  description,
  category,
  icon,
  parameters: { type: "object", properties, required },
});

// ─────────────────────────────────────────────────────────────
// CATALOG — 24 curated agent tools (7 categories)
// ─────────────────────────────────────────────────────────────
export const AGENT_TOOL_CATALOG: AgentToolDef[] = [
  // ── Search & Web ───────────────────────────────────────────
  t(
    "web_search",
    "ابحث في الإنترنت عن معلومات حديثة. رجّع نتائج بحث مع عناوين وروابط ومقتطفات.",
    "search",
    "🔍",
    {
      query: { type: "string", description: "البحث اللي عايز تعمله" },
      maxResults: { type: "number", description: "أقصى عدد نتائج (افتراضي 5)" },
    },
    ["query"],
  ),
  t(
    "page_read",
    "اقرأ محتوى أي صفحة ويب من URL. رجّع النص الكامل أو الملخص.",
    "search",
    "🌐",
    {
      url: { type: "string", description: "رابط الصفحة" },
      maxLength: { type: "number", description: "أقصى طول للنص الراجع (افتراضي 4000 حرف)" },
    },
    ["url"],
  ),
  t(
    "wikipedia_search",
    "ابحث في ويكيبيديا عن معلومات موثوقة. رجّع ملخص المقالة.",
    "search",
    "📚",
    {
      query: { type: "string", description: "مصطلح البحث" },
      lang: { type: "string", description: "اللغة (ar, en) — افتراضي ar" },
    },
    ["query"],
  ),

  // ── Content Creation ───────────────────────────────────────
  t(
    "write_article",
    "اكتب مقال كامل بعنوان ومقدمة ونقاط رئيسية وخاتمة.",
    "content",
    "✍️",
    {
      topic: { type: "string", description: "موضوع المقال" },
      tone: { type: "string", description: "النبرة (formal, casual, technical)" },
      wordCount: { type: "number", description: "عدد الكلمات التقريبي" },
    },
    ["topic"],
  ),
  t(
    "write_social_post",
    "اكتب بوست سوشيال ميديا لمنصة معينة (twitter, linkedin, facebook, instagram).",
    "content",
    "📱",
    {
      platform: { type: "string", description: "twitter | linkedin | facebook | instagram" },
      topic: { type: "string", description: "موضوع البوست" },
      tone: { type: "string", description: "النبرة" },
    },
    ["platform", "topic"],
  ),
  t(
    "generate_hashtags",
    "ولّد hashtags مناسبة لمحتوى معين.",
    "content",
    "#️⃣",
    {
      content: { type: "string", description: "المحتوى اللي عايز hashtags له" },
      count: { type: "number", description: "عدد الـ hashtags (افتراضي 10)" },
    },
    ["content"],
  ),
  t(
    "translate_text",
    "ترجم نص من لغة لأخرى.",
    "content",
    "🌐",
    {
      text: { type: "string", description: "النص اللي عايز تترجمه" },
      from: { type: "string", description: "لغة المصدر (auto للكشف التلقائي)" },
      to: { type: "string", description: "لغة الوجهة" },
    },
    ["text", "to"],
  ),
  t(
    "summarize_text",
    "لخّص نص طويل لنقاط رئيسية.",
    "content",
    "📝",
    {
      text: { type: "string", description: "النص اللي عايز تلخصه" },
      style: { type: "string", description: "bullets | paragraph | tldr" },
    },
    ["text"],
  ),

  // ── Code & Dev ─────────────────────────────────────────────
  t(
    "execute_code",
    "نفّذ كود JavaScript ورجّع النتيجة. آمن (sandboxed).",
    "code",
    "⚡",
    {
      code: { type: "string", description: "الكود اللي عايز تنفذه" },
    },
    ["code"],
  ),
  t(
    "generate_code",
    "ولّد كود بلغة معينة لمهمة معينة.",
    "code",
    "💻",
    {
      task: { type: "string", description: "وصف المهمة" },
      language: { type: "string", description: "لغة البرمجة" },
      framework: { type: "string", description: "إطار العمل (اختياري)" },
    },
    ["task", "language"],
  ),
  t(
    "review_code",
    "راجع كود واكتشف bugs، performance issues، security issues، واقتراحات تحسين.",
    "code",
    "🔍",
    {
      code: { type: "string", description: "الكود اللي عايز تراجعه" },
      language: { type: "string", description: "لغة الكود" },
    },
    ["code"],
  ),

  // ── Data & Analysis ────────────────────────────────────────
  t(
    "analyze_data",
    "حلّل بيانات (JSON/CSV) واطلع insights وإحصائيات.",
    "data",
    "📊",
    {
      data: { type: "string", description: "البيانات بصيغة JSON أو CSV" },
      question: { type: "string", description: "السؤال اللي عايز تجاوبه عن البيانات" },
    },
    ["data"],
  ),
  t(
    "create_chart",
    "ارسم chart من بيانات. رجّع وصف للـ chart (نوع + بيانات + عنوان).",
    "data",
    "📈",
    {
      data: { type: "string", description: "البيانات بصيغة JSON" },
      type: { type: "string", description: "bar | line | pie | scatter" },
      title: { type: "string", description: "عنوان الـ chart" },
    },
    ["data", "type"],
  ),
  t(
    "currency_convert",
    "حوّل عملة بأسعار صرف تقريبية.",
    "data",
    "💱",
    {
      amount: { type: "number", description: "المبلغ" },
      from: { type: "string", description: "عملة المصدر (USD, EUR, EGP, ...)" },
      to: { type: "string", description: "عملة الوجهة" },
    },
    ["amount", "from", "to"],
  ),

  // ── Communication ──────────────────────────────────────────
  t(
    "send_email",
    "ابعت إيميل (محاكاة — بيتسجل في الـ agent log مش بيتابع فعلياً).",
    "communication",
    "📧",
    {
      to: { type: "string", description: "إيميل المستلم" },
      subject: { type: "string", description: "موضوع الإيميل" },
      body: { type: "string", description: "محتوى الإيميل" },
    },
    ["to", "subject", "body"],
  ),
  t(
    "draft_email",
    "اكتب مسودة إيميل احترافي بنبرة محددة.",
    "communication",
    "✉️",
    {
      purpose: { type: "string", description: "الغرض من الإيميل" },
      recipient: { type: "string", description: "المستلم (name/role)" },
      tone: { type: "string", description: "formal | casual | persuasive" },
    },
    ["purpose"],
  ),

  // ── Utility ────────────────────────────────────────────────
  t(
    "get_time",
    "اجيب الوقت الحالي في منطقة زمنية معينة.",
    "utility",
    "🕐",
    {
      timezone: { type: "string", description: "المنطقة الزمنية (Africa/Cairo, ...)" },
    },
  ),
  t(
    "generate_uuid",
    "ولّد UUIDs عشوائية.",
    "utility",
    "🆔",
    {
      count: { type: "number", description: "عدد الـ UUIDs (افتراضي 1)" },
    },
  ),
  t(
    "generate_password",
    "ولّد كلمة مرور قوية بطول محدد.",
    "utility",
    "🔐",
    {
      length: { type: "number", description: "طول كلمة المرور (افتراضي 16)" },
      symbols: { type: "boolean", description: "هل تضم رموز؟ (افتراضي true)" },
    },
  ),
  t(
    "calculate",
    "احسب تعبير رياضي. ينفع لـ +, -, *, /, ^, sqrt, sin, cos, log, ...",
    "utility",
    "🧮",
    {
      expression: { type: "string", description: "التعبير الرياضي (مثال: 2+2*3, sqrt(16))" },
    },
    ["expression"],
  ),

  // ── AI-Powered ─────────────────────────────────────────────
  t(
    "generate_image",
    "ولّد صورة من وصف نصي. رجّع وصف للصورة المتولدة (محاكاة).",
    "ai",
    "🎨",
    {
      prompt: { type: "string", description: "وصف الصورة" },
      style: { type: "string", description: "realistic | cartoon | sketch | 3d" },
    },
    ["prompt"],
  ),
  t(
    "sentiment_analysis",
    "حلّل مشاعر نص (positive, negative, neutral) + النسبة.",
    "ai",
    "💭",
    {
      text: { type: "string", description: "النص اللي عايز تحلل مشاعره" },
    },
    ["text"],
  ),
  t(
    "brainstorm_ideas",
    "ولّد أفكار إبداعية لموضوع أو مشكلة معينة.",
    "ai",
    "💡",
    {
      topic: { type: "string", description: "الموضوع" },
      count: { type: "number", description: "عدد الأفكار (افتراضي 5)" },
    },
    ["topic"],
  ),
];

// Helpers ─────────────────────────────────────────────────────

// Set of curated tool names (for fast lookup)
const CURATED_TOOL_NAMES = new Set(AGENT_TOOL_CATALOG.map((t) => t.name));

/**
 * Load MCP tools from registry (lazy — only called when needed).
 * Returns AgentToolDef[] for all 340+ MCP tools not already in the curated catalog.
 */
let _mcpToolsCache: AgentToolDef[] | null = null;

async function loadMCPTools(): Promise<AgentToolDef[]> {
  if (_mcpToolsCache) return _mcpToolsCache;
  try {
    // استخدم Function constructor لتجنب تحليل الـ bundler للـ import
    // ده بيمنع webpack/turbopack من تتبع dependency tree لـ mcp/registry
    // (اللي بيـ import Node-only modules زي dns في الـ browser)
    const mod = await (new Function("return import('@/lib/mcp/registry')")() as Promise<typeof import("@/lib/mcp/registry")>);
    const mcpTools = mod.listTools();
    _mcpToolsCache = mcpTools
      .filter((t) => !CURATED_TOOL_NAMES.has(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description,
        category: "mcp" as ToolCategory,
        icon: "⚡",
        parameters: t.parameters as {
          type: "object";
          properties: Record<string, unknown>;
          required?: string[];
        },
      }));
    return _mcpToolsCache;
  } catch {
    return [];
  }
}

/**
 * Get tool by name — searches both curated catalog AND MCP registry.
 * For MCP tools, returns a minimal def (icon ⚡, category mcp).
 */
export function getToolByName(name: string): AgentToolDef | undefined {
  // Check curated catalog first (fast, synchronous)
  const curated = AGENT_TOOL_CATALOG.find((t) => t.name === name);
  if (curated) return curated;

  // Check MCP registry metadata (synchronous — TOOL_META is static)
  // We use a lazy import pattern here for client-side safety
  return undefined;
}

/**
 * Async version — searches both curated AND MCP registry.
 * Use this when you need full tool metadata including MCP tools.
 */
export async function getToolByNameAsync(name: string): Promise<AgentToolDef | undefined> {
  const curated = AGENT_TOOL_CATALOG.find((t) => t.name === name);
  if (curated) return curated;

  try {
    // استخدم Function constructor لتجنب تحليل الـ bundler
    const mod = await (new Function("return import('@/lib/mcp/registry')")() as Promise<typeof import("@/lib/mcp/registry")>);
    const meta = mod.getToolMeta(name);
    if (meta) {
      return {
        name: meta.name,
        description: meta.description,
        category: "mcp",
        icon: "⚡",
        parameters: meta.parameters as {
          type: "object";
          properties: Record<string, unknown>;
          required?: string[];
        },
      };
    }
  } catch {}
  return undefined;
}

/**
 * Check if a tool name exists (in curated catalog OR MCP registry OR external servers).
 */
export async function isValidToolName(name: string): Promise<boolean> {
  if (CURATED_TOOL_NAMES.has(name)) return true;
  // External tools have "serverId__toolName" format
  if (name.includes("__")) {
    try {
      const { loadExternalTools } = await import("./mcp-client");
      const external = await loadExternalTools();
      return external.has(name);
    } catch {
      return false;
    }
  }
  try {
    // استخدم Function constructor لتجنب تحليل الـ bundler
    const mod = await (new Function("return import('@/lib/mcp/registry')")() as Promise<typeof import("@/lib/mcp/registry")>);
    return mod.hasTool(name);
  } catch {
    return false;
  }
}

/** Get curated tools only (synchronous, fast) */
export function getCuratedTools(): AgentToolDef[] {
  return AGENT_TOOL_CATALOG;
}

/** Get all tools by category (async — loads MCP tools lazily) */
export async function getToolsByCategoryAsync(): Promise<Record<ToolCategory, AgentToolDef[]>> {
  const map: Record<ToolCategory, AgentToolDef[]> = {
    search: [],
    content: [],
    code: [],
    data: [],
    communication: [],
    utility: [],
    ai: [],
    mcp: [],
  };
  for (const tool of AGENT_TOOL_CATALOG) {
    map[tool.category].push(tool);
  }
  // Add MCP tools
  const mcpTools = await loadMCPTools();
  map.mcp = mcpTools;
  return map;
}

/** Synchronous version (curated tools only — no MCP) */
export function getToolsByCategory(): Record<ToolCategory, AgentToolDef[]> {
  const map: Record<ToolCategory, AgentToolDef[]> = {
    search: [],
    content: [],
    code: [],
    data: [],
    communication: [],
    utility: [],
    ai: [],
    mcp: [],
  };
  for (const tool of AGENT_TOOL_CATALOG) {
    map[tool.category].push(tool);
  }
  return map;
}

export const CATEGORY_META: Record<ToolCategory, { label: string; icon: string; color: string }> = {
  search: { label: "بحث ويب", icon: "🔍", color: "text-sky-500" },
  content: { label: "كتابة محتوى", icon: "✍️", color: "text-rose-500" },
  code: { label: "كود وبرمجة", icon: "💻", color: "text-violet-500" },
  data: { label: "بيانات وتحليل", icon: "📊", color: "text-emerald-500" },
  communication: { label: "تواصل وإيميل", icon: "📧", color: "text-amber-500" },
  utility: { label: "أدوات مساعدة", icon: "🔧", color: "text-cyan-500" },
  ai: { label: "ذكاء اصطناعي", icon: "🤖", color: "text-fuchsia-500" },
  mcp: { label: "أدوات MCP (340+)", icon: "⚡", color: "text-orange-500" },
};

/**
 * Convert tool names to GLM function-calling schema.
 * Searches both curated catalog AND MCP registry (async).
 */
export async function toolsToGLMSchemaAsync(toolNames: string[]) {
  const result = [];

  // Load external tools (for resolving external tool schemas)
  let externalTools: Map<string, { description: string; inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] } }> | null = null;

  for (const name of toolNames) {
    // Check if it's an external tool (has "__" separator)
    if (name.includes("__")) {
      try {
        if (!externalTools) {
          const { loadExternalTools } = await import("./mcp-client");
          externalTools = await loadExternalTools() as any;
        }
        const ext = externalTools.get(name);
        if (!ext) continue;
        result.push({
          type: "function" as const,
          function: {
            name,
            description: `[External: ${ext.description || "tool"}]`,
            parameters: ext.inputSchema,
          },
        });
        continue;
      } catch {
        continue;
      }
    }

    const def = await getToolByNameAsync(name);
    if (!def) continue;
    result.push({
      type: "function" as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
    });
  }
  return result;
}

/** Synchronous version (curated tools only) */
export function toolsToGLMSchema(toolNames: string[]) {
  return toolNames
    .map((name) => {
      const def = getToolByName(name);
      if (!def) return null;
      return {
        type: "function" as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: def.parameters,
        },
      };
    })
    .filter(Boolean) as Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
    };
  }>;
}

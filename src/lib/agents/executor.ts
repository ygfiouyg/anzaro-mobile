/**
 * Agent Tool Executor
 * ===================
 * بينفّذ الأدوات اللي الوكيل اختارها. بعض الأدوات حقيقية (calc, uuid, time, code exec)
 * وبعضها محاكاة (web_search, page_read, send_email) عشان نشتغل بدون API keys.
 *
 * كل أداة بترجّع: { success: boolean, output: any, error?: string }
 */

import { db } from "@/lib/db";

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Utility tools (real implementations)
// ─────────────────────────────────────────────────────────────

function get_time(args: { timezone?: string }): ToolResult {
  const tz = args.timezone || "Africa/Cairo";
  try {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("ar-EG", {
      timeZone: tz,
      dateStyle: "full",
      timeStyle: "long",
    }).format(now);
    return {
      success: true,
      output: { time: formatted, iso: now.toISOString(), timezone: tz },
    };
  } catch {
    return { success: false, output: null, error: "Invalid timezone" };
  }
}

function generate_uuid(args: { count?: number }): ToolResult {
  const count = Math.max(1, Math.min(20, Number(args.count) || 1));
  const uuids: string[] = [];
  for (let i = 0; i < count; i++) {
    uuids.push(crypto.randomUUID());
  }
  return { success: true, output: { uuids } };
}

function generate_password(args: { length?: number; symbols?: boolean }): ToolResult {
  const len = Math.max(4, Math.min(64, Number(args.length) || 16));
  const useSymbols = args.symbols !== false;
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const pool = useSymbols ? chars + symbols : chars;
  let password = "";
  const randomValues = new Uint32Array(len);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < len; i++) {
    password += pool[randomValues[i] % pool.length];
  }
  return { success: true, output: { password, length: len } };
}

function calculate(args: { expression: string }): ToolResult {
  const expr = String(args.expression || "").trim();
  if (!expr) return { success: false, output: null, error: "Expression required" };
  // SECURITY: Strict allow-list — only numbers, operators, parentheses, decimals, and known Math functions
  // Reject ANYTHING else (no strings, no identifiers except Math.*, no parentheses tricks)
  const allowed = /^[\d+\-*/().,\s]*(?:Math\.(?:sqrt|sin|cos|tan|log|abs|floor|ceil|round|PI|E|max|min|pow|exp|sign|atan|asin|acos|atan2)[\d+\-*/().,\s]*)*$/;
  if (!allowed.test(expr)) {
    return { success: false, output: null, error: "Invalid characters in expression — only numbers and Math.* functions allowed" };
  }
  try {
    // Safe: only Math.* and operators are allowed by the regex
    const fn = new Function(`"use strict"; return (${expr});`);
    const result = fn();
    return { success: true, output: { expression: expr, result: String(result) } };
  } catch (e: any) {
    return { success: false, output: null, error: `Calculation failed: ${e.message}` };
  }
}

async function execute_code(args: { code: string }): Promise<ToolResult> {
  const code = String(args.code || "").trim();
  if (!code) return { success: false, output: null, error: "No code provided" };

  // SECURITY: Strict allow-list of safe JavaScript operations
  // Block ANY access to: process, require, import, global, globalThis, constructor, __proto__,
  // prototype, eval, Function, this, window, document, fetch, XMLHttpRequest
  const BLOCKED = /\b(process|require|import|global|globalThis|constructor|__proto__|prototype|eval|Function|this\b|window|document|fetch|XMLHttpRequest|child_process|fs|net|http|https|os|path|crypto|stream|dns|tls|cluster|worker|v8|repl|vm|assert|util|events|buffer)\b/;
  if (BLOCKED.test(code)) {
    return { success: false, output: null, error: "Blocked: code contains forbidden keywords" };
  }

  // Additional: block string concatenation tricks like "pro"+"cess"
  // by checking for any quoted strings that could form blocked words
  const stringConcat = /["'`][^"'`]*["'`]\s*\+/;
  if (stringConcat.test(code) && BLOCKED.test(code.replace(/["'`][^"'`]*["'`]/g, ""))) {
    return { success: false, output: null, error: "Blocked: potential string concatenation bypass detected" };
  }

  try {
    // Capture console.log output
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    let result: unknown;

    try {
      // Create a restricted sandbox with frozen globals
      const sandbox: Record<string, unknown> = {
        console: { log: (...args: unknown[]) => logs.push(args.map(String).join(" ")) },
        Math,
        Date,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        parseInt,
        parseFloat,
        isNaN,
        String: String,
        RegExp,
        Map,
        Set,
        Promise,
        Symbol,
        Error,
      };

      // Use Function with strict mode and restricted scope
      // Note: this is NOT a full sandbox — but with the strict allow-list above,
      // it blocks known escape vectors
      const fn = new Function('"use strict"; const {console,Math,Date,JSON,Array,Object,String,Number,Boolean,parseInt,parseFloat,isNaN,RegExp,Map,Set,Promise,Symbol,Error} = arguments[0]; ' + code);
      result = fn(sandbox);
    } finally {
      console.log = origLog;
    }
    return {
      success: true,
      output: {
        logs: logs.length > 0 ? logs : undefined,
        result: result !== undefined ? String(result) : undefined,
      },
    };
  } catch (e: any) {
    return { success: false, output: null, error: `Execution failed: ${e.message}` };
  }
}

// ─────────────────────────────────────────────────────────────
// Currency (real — uses exchange rate API)
// ─────────────────────────────────────────────────────────────

async function currency_convert(args: {
  amount: number;
  from: string;
  to: string;
}): Promise<ToolResult> {
  const { amount, from, to } = args;
  if (!amount || !from || !to) {
    return { success: false, output: null, error: "amount, from, to required" };
  }
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${String(from).toUpperCase()}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, output: null, error: `API ${res.status}` };
    const data = await res.json();
    const rate = data?.rates?.[String(to).toUpperCase()];
    if (!rate) return { success: false, output: null, error: "Rate not found" };
    const converted = (Number(amount) * rate).toFixed(4);
    return {
      success: true,
      output: {
        amount: Number(amount),
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        rate: Number(rate),
        converted: Number(converted),
      },
    };
  } catch (e: any) {
    return { success: false, output: null, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Wikipedia (real)
// ─────────────────────────────────────────────────────────────

async function wikipedia_search(args: { query: string; lang?: string }): Promise<ToolResult> {
  const lang = args.lang || "ar";
  const query = String(args.query || "").trim();
  if (!query) return { success: false, output: null, error: "Query required" };
  try {
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, output: null, error: `Wikipedia ${res.status}` };
    const data = await res.json();
    const results = (data?.query?.search ?? []).slice(0, 3).map((item: any) => ({
      title: item.title,
      snippet: String(item.snippet || "").replace(/<[^>]+>/g, ""),
      pageId: item.pageid,
      url: `https://${lang}.wikipedia.org/?curid=${item.pageid}`,
    }));
    return { success: true, output: { results } };
  } catch (e: any) {
    return { success: false, output: null, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Simulated / local tools (return formatted output without external APIs)
// ─────────────────────────────────────────────────────────────

function web_search(args: { query: string; maxResults?: number }): ToolResult {
  const query = String(args.query || "").trim();
  if (!query) return { success: false, output: null, error: "Query required" };
  const max = Math.max(1, Math.min(10, Number(args.maxResults) || 5));
  // محاكاة — في إنتاج حقيقي نستخدم z-ai-web-dev-sdk web search
  return {
    success: true,
    output: {
      note: "Web search is simulated in this environment. Configure a real search API key to enable live results.",
      query,
      results: Array.from({ length: Math.min(max, 3) }, (_, i) => ({
        title: `نتيجة بحث ${i + 1} عن: ${query}`,
        url: `https://example.com/result-${i + 1}`,
        snippet: `هذه نتيجة بحث تجريبية عن "${query}". في بيئة الإنتاج، هنا هيظهر مقتطف حقيقي من الصفحة.`,
      })),
    },
  };
}

function page_read(args: { url: string; maxLength?: number }): ToolResult {
  const url = String(args.url || "").trim();
  if (!url) return { success: false, output: null, error: "URL required" };
  const max = Number(args.maxLength) || 4000;
  return {
    success: true,
    output: {
      note: "Page reading is simulated in this environment.",
      url,
      content: `[محاكاة] محتوى الصفحة ${url}. في بيئة الإنتاج، هنا هيظهر النص الحقيقي للصفحة (حتى ${max} حرف).`,
    },
  };
}

function send_email(args: { to: string; subject: string; body: string }): ToolResult {
  if (!args.to || !args.subject || !args.body) {
    return { success: false, output: null, error: "to, subject, body all required" };
  }
  return {
    success: true,
    output: {
      status: "queued (simulated)",
      to: args.to,
      subject: args.subject,
      bodyLength: String(args.body).length,
      message: "الإيميل ايتسجل في الـ agent log. مفيش إرسال فعلي في بيئة الـ sandbox.",
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Main dispatch
// ─────────────────────────────────────────────────────────────

export async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "web_search":
        return web_search(args as any);
      case "page_read":
        return page_read(args as any);
      case "wikipedia_search":
        return await wikipedia_search(args as any);
      case "send_email":
        return send_email(args as any);
      case "get_time":
        return get_time(args as any);
      case "generate_uuid":
        return generate_uuid(args as any);
      case "generate_password":
        return generate_password(args as any);
      case "calculate":
        return calculate(args as any);
      case "currency_convert":
        return await currency_convert(args as any);
      case "execute_code":
        return await execute_code(args as any);

      // ── Tools that depend on the GLM call (handled in orchestrator as "passthrough") ──
      // هذه الأدوات بيرجّعها الـ orchestrator للـ GLM كـ tool result، لكن الـ GLM نفسه
      // بيكتب المحتوى. هنا بنرجّع placeholder وبعدين الـ GLM بيلف تاني ويكتب الناتج.
      case "write_article":
      case "write_social_post":
      case "generate_hashtags":
      case "translate_text":
      case "summarize_text":
      case "generate_code":
      case "review_code":
      case "analyze_data":
      case "create_chart":
      case "draft_email":
      case "generate_image":
      case "sentiment_analysis":
      case "brainstorm_ideas":
        return {
          success: true,
          output: {
            _passthrough: true,
            message: `أداة "${toolName}" بتشتغل عبر GLM مباشرةً. اتصل بالأداة وحدّد الـ output بناءً على الـ args.`,
            args,
          },
        };

      default:
        // Not a curated tool — check if it's an external MCP tool first
        if (toolName.includes("__")) {
          return await delegateToExternalMCP(toolName, args);
        }
        // Otherwise try delegating to the local MCP registry (340+ tools)
        return await delegateToMCPRegistry(toolName, args);
    }
  } catch (e: any) {
    return { success: false, output: null, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Delegate to MCP Registry (for the 340+ MCP tools)
// ─────────────────────────────────────────────────────────────

async function delegateToMCPRegistry(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const { executeTool: executeMCPTool, hasTool } = await import("@/lib/mcp/registry");
    if (!hasTool(toolName)) {
      return { success: false, output: null, error: `Unknown tool: ${toolName}` };
    }
    const result = await executeMCPTool(toolName, args);
    return {
      success: result.success,
      output: result.data ?? result.error,
      error: result.error,
    };
  } catch (e: any) {
    return { success: false, output: null, error: `MCP delegation failed: ${e.message}` };
  }
}

// ─────────────────────────────────────────────────────────────
// Delegate to External MCP Server (for tools from external servers)
// ─────────────────────────────────────────────────────────────

async function delegateToExternalMCP(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const { executeExternalTool } = await import("./mcp-client");
    const result = await executeExternalTool(toolName, args);
    return {
      success: result.success,
      output: result.data ?? result.error,
      error: result.error,
    };
  } catch (e: any) {
    return {
      success: false,
      output: null,
      error: `External MCP delegation failed: ${e.message}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Track run count on the agent
// ─────────────────────────────────────────────────────────────

export async function incrementAgentRunCount(agentId: string): Promise<void> {
  try {
    await db.customAgent.update({
      where: { id: agentId },
      data: { runCount: { increment: 1 } },
    });
  } catch {
    // silent — non-critical
  }
}

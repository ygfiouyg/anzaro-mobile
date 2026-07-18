/**
 * /api/mcp/execute
 * ================
 * Endpoint لإدارة وتنفيذ أدوات MCP.
 *
 * GET  /api/mcp/execute            — قائمة كل الأدوات المتاحة (metadata only)
 * GET  /api/mcp/execute?name=xxx   — تفاصيل أداة واحدة
 * POST /api/mcp/execute            — تنفيذ أداة واحدة
 *      Body: { "name": "tool_name", "params": { ... } }
 *      Response: { "success": boolean, "data"?: any, "error"?: string }
 *
 * Headers:
 *   Authorization: Bearer <token>   // required
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { listTools, getTool, executeTool } from "@/lib/mcp/registry";
import type { MCPTool } from "@/lib/mcp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// maxDuration = 300s — heavy LLM-backed MCP tools (blog_write, pdf_chat, web crawl)
// were timing out at the default 5–15s limit, showing as "BROKEN" in the audit.
export const maxDuration = 300;

/** Serialize a tool's metadata (no execute fn in JSON). */
function serializeTool(tool: MCPTool) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — list tools or inspect one
// ─────────────────────────────────────────────────────────────────────────────
export const GET = withAuth(async (request: NextRequest) => {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");

  if (name) {
    const tool = await getTool(name);
    if (!tool) {
      return NextResponse.json(
        {
          success: false,
          error: "tool_not_found",
          message: `أداة "${name}" غير موجودة`,
        },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      tool: serializeTool(tool),
    });
  }

  const tools = listTools();
  return NextResponse.json({
    success: true,
    count: tools.length,
    tools,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST — execute a tool
// ─────────────────────────────────────────────────────────────────────────────
interface ExecuteRequestBody {
  name?: string;
  params?: Record<string, unknown>;
}

export const POST = withAuth(async (request: NextRequest) => {
  let body: ExecuteRequestBody;
  try {
    body = (await request.json()) as ExecuteRequestBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid_json", message: "الـ body لازم يكون JSON صالح" },
      { status: 400 },
    );
  }

  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json(
      { success: false, error: "missing_name", message: "name مطلوبة" },
      { status: 400 },
    );
  }

  const params =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {};

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const result = await executeTool(name, params);
  const durationMs = Date.now() - t0;

  return NextResponse.json({
    ...result,
    tool: name,
    startedAt,
    durationMs,
  });
});

/**
 * POST /api/mcp/dry-run
 * ======================
 * Test a specific MCP tool with auto-generated dummy data.
 * Parses the tool's JSON schema → generates valid params → executes.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/with-auth";
import { executeTool, getToolMeta } from "@/lib/mcp/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function generateDummyValue(prop: Record<string, unknown>): unknown {
  if (!prop || typeof prop !== "object") return "test";
  const type = prop["type"] as string;
  const desc = (prop["description"] as string || "").toLowerCase();
  const enumVals = prop["enum"] as unknown[];
  if (enumVals?.length) return enumVals[0];
  if (prop["default"] !== undefined) return prop["default"];
  switch (type) {
    case "string":
      if (desc.includes("url")) return "https://example.com";
      if (desc.includes("email")) return "test@example.com";
      if (desc.includes("query") || desc.includes("search")) return "test query";
      if (desc.includes("coin")) return "bitcoin";
      if (desc.includes("from")) return "USD";
      if (desc.includes("to")) return "EUR";
      return "test";
    case "number": case "integer": return 42;
    case "boolean": return true;
    case "array": return [];
    case "object": return {};
    default: return "test";
  }
}

function generateDummyParams(schema: { properties?: Record<string, unknown>; required?: string[] }): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  for (const [name, prop] of Object.entries(props)) {
    if (required.has(name) || Object.keys(params).length < 3) {
      params[name] = generateDummyValue(prop as Record<string, unknown>);
    }
  }
  return params;
}

export const POST = withAuth(async (req: NextRequest, _ctx: AuthContext) => {
  try {
    const body = await req.json();
    const toolName = String(body.toolName || "").trim();
    if (!toolName) return NextResponse.json({ success: false, error: "toolName required" }, { status: 400 });

    const meta = getToolMeta(toolName);
    if (!meta) return NextResponse.json({ success: false, error: `Tool "${toolName}" not found` }, { status: 404 });

    let params = body.params;
    if (!params || typeof params !== "object") {
      params = generateDummyParams(meta.parameters as any);
    }

    const t0 = Date.now();
    const result = await executeTool(toolName, params as Record<string, unknown>);
    const durationMs = Date.now() - t0;

    return NextResponse.json({
      success: result.success,
      toolName,
      generatedParams: params,
      result: result.success
        ? (typeof result.data === "string" ? result.data.slice(0, 3000) : JSON.stringify(result.data, null, 2).slice(0, 3000))
        : undefined,
      error: result.error,
      durationMs,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
});

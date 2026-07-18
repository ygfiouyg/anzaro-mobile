/**
 * GET /api/tools
 * ==============
 * Returns the full registry of 60 MCP tools, grouped by category.
 * Used by the frontend to render the tool explorer panel.
 */

import { ALL_TOOLS, CATEGORY_META, toolsByCategory, type ToolCategory } from "@/lib/mcp/tools-registry";
import { validateRegistry } from "@/lib/mcp/tool-executor";
import { getMCPClient } from "@/lib/mcp/mcp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const validation = validateRegistry();
  const mcp = getMCPClient();
  const status = mcp.status();

  const grouped = (Object.keys(CATEGORY_META) as ToolCategory[]).map((cat) => ({
    category: cat,
    ...CATEGORY_META[cat],
    tools: toolsByCategory(cat),
  }));

  return Response.json({
    total: ALL_TOOLS.length,
    status,
    validation,
    categories: grouped,
    tools: ALL_TOOLS,
  });
}

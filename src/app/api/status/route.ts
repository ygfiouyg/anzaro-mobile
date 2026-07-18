/**
 * GET /api/status
 * ===============
 * Health-check + system status for the DELTA AI platform.
 */

import { getMCPClient } from "@/lib/mcp/mcp-client";
import { ALL_TOOLS } from "@/lib/mcp/tools-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mcp = getMCPClient();
  return Response.json({
    ok: true,
    platform: "DELTA AI — GLM MCP Orchestration Engine",
    model: "GLM-4.6 (via z-ai-web-dev-sdk)",
    engine: {
      mcp: "@modelcontextprotocol/sdk",
      sandbox: "isolated-vm",
      docs: ["pdfkit", "pptxgenjs", "exceljs", "docx"],
    },
    tools: {
      total: ALL_TOOLS.length,
      categories: 6,
      ...mcp.status(),
    },
    timestamp: new Date().toISOString(),
  });
}

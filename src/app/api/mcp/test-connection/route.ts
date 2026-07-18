/**
 * POST /api/mcp/test-connection
 * =============================
 * Live MCP handshake: initialize → capabilities → tools/list
 * Creates REAL StreamableHTTPClientTransport, connects, fetches tools.
 * NO hardcoding — everything is dynamic from the URL provided.
 *
 * Body: { "url": "https://...", "authToken": "optional" }
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface TimelineStep {
  step: string;
  status: "ok" | "error" | "pending";
  timestamp: string;
  detail?: string;
}

export async function POST(req: NextRequest) {
  const timeline: TimelineStep[] = [];
  const ts = () => new Date().toISOString();

  try {
    const body = await req.json();
    const url = String(body.url || "").trim();
    const authToken = body.authToken ? String(body.authToken).trim() : undefined;

    // ── URL Validation ──
    if (!url) {
      return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 });
    }
    try {
      new URL(url); // throws if invalid
    } catch {
      return NextResponse.json({ success: false, error: `Invalid URL: ${url}` }, { status: 400 });
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json({ success: false, error: "URL must start with http:// or https://" }, { status: 400 });
    }

    // Step 1: Attempting Connection
    timeline.push({ step: "Attempting Connection", status: "pending", timestamp: ts(), detail: url });

    const headers: Record<string, string> = {
      "Accept": "application/json, text/event-stream",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    // Create REAL transport
    let transport: StreamableHTTPClientTransport;
    try {
      transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
      timeline[timeline.length - 1].status = "ok";
    } catch (e: any) {
      timeline[timeline.length - 1].status = "error";
      timeline[timeline.length - 1].detail = e.message;
      return NextResponse.json({ success: false, timeline, error: `Transport creation failed: ${e.message}` });
    }

    // Step 2: Handshake — initialize request
    timeline.push({ step: "Handshake Sent (initialize)", status: "pending", timestamp: ts() });

    const client = new Client(
      { name: "deltaai-mcp-client", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    );

    try {
      const connectPromise = client.connect(transport);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Handshake timeout (15s)")), 15_000);
      });
      await Promise.race([connectPromise, timeoutPromise]);
      timeline[timeline.length - 1].status = "ok";
    } catch (e: any) {
      timeline[timeline.length - 1].status = "error";
      timeline[timeline.length - 1].detail = e.message;
      return NextResponse.json({
        success: false,
        timeline,
        error: `Handshake failed: ${e.message}`,
      });
    }

    // Step 3: Fetch capabilities (tools/list + resources/list)
    timeline.push({ step: "Fetching Capabilities", status: "pending", timestamp: ts() });

    let tools: Array<{ name: string; description: string; inputSchema?: unknown }> = [];
    let resources: Array<{ uri: string; name: string; description?: string }> = [];
    let serverInfo: { name?: string; version?: string } = {};

    try {
      // Get server info from the connection
      // The client already has it after connect
      // Try listTools
      try {
        const toolsResp = await client.listTools();
        tools = (toolsResp.tools || []).map((t: any) => ({
          name: t.name,
          description: t.description || "",
          inputSchema: t.inputSchema,
        }));
      } catch (e: any) {
        // tools not supported
      }

      // Try listResources
      try {
        const resourcesResp = await client.listResources();
        resources = (resourcesResp.resources || []).map((r: any) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
        }));
      } catch {
        // resources not supported
      }

      timeline[timeline.length - 1].status = "ok";
      timeline[timeline.length - 1].detail = `${tools.length} tools, ${resources.length} resources`;
    } catch (e: any) {
      timeline[timeline.length - 1].status = "error";
      timeline[timeline.length - 1].detail = e.message;
    }

    // Cleanup
    await client.close().catch(() => {});

    // Step 4: Active
    timeline.push({ step: "Active", status: "ok", timestamp: ts(), detail: `Connected — ${tools.length} tools available` });

    return NextResponse.json({
      success: true,
      timeline,
      serverInfo,
      tools,
      resources,
      toolCount: tools.length,
    });
  } catch (e: any) {
    timeline.push({ step: "Error", status: "error", timestamp: ts(), detail: e.message });
    return NextResponse.json({ success: false, timeline, error: e.message }, { status: 500 });
  }
}

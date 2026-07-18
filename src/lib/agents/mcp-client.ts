/**
 * MCP Client — DeltaAI as MCP Client
 * ==================================
 * Connects to external MCP servers (by URL), fetches their tools,
 * and makes those tools available to DeltaAI agents.
 *
 * This is the reverse of our MCP server: instead of exposing tools,
 * we consume tools from external servers.
 *
 * Flow:
 *   1. User adds external MCP server URL via UI
 *   2. MCP client connects (Streamable HTTP transport)
 *   3. Fetches tools/list → caches in DB
 *   4. When agent runs and calls an external tool:
 *      a. MCP client sends tools/call to external server
 *      b. Returns result to agent
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ExternalTool {
  serverId: string;
  serverName: string;
  toolName: string;
  /** Full name: "serverName__toolName" (avoid collisions) */
  fullName: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ConnectionResult {
  success: boolean;
  toolCount: number;
  tools: ExternalTool[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// MCP Client
// ─────────────────────────────────────────────────────────────

/**
 * Connect to an external MCP server and fetch its tools.
 * Uses Streamable HTTP transport (the standard for remote MCP servers).
 *
 * @param url - The MCP server URL (e.g., "https://example.com/mcp")
 * @param authToken - Optional bearer token for auth
 * @returns List of tools exposed by the external server
 */
export async function connectToMcpServer(
  url: string,
  authToken?: string,
): Promise<ConnectionResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      success: false,
      toolCount: 0,
      tools: [],
      error: "Invalid URL — must start with http:// or https://",
    };
  }

  const headers: Record<string, string> = {
    "Accept": "application/json, text/event-stream",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    // Create transport
    const transport = new StreamableHTTPClientTransport(
      new URL(url),
      { requestInit: { headers } },
    );

    // Create client
    const client = new Client(
      { name: "deltaai-mcp-client", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    );

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout (10s)")), 10_000);
    });

    await Promise.race([connectPromise, timeoutPromise]);

    // Fetch tools
    const toolsList = await client.listTools();

    // Disconnect
    await client.close();

    const tools: ExternalTool[] = (toolsList.tools || []).map((t: any) => ({
      serverId: "", // filled by caller
      serverName: "", // filled by caller
      toolName: t.name,
      fullName: `__${t.name}`, // prefix filled by caller
      description: t.description || "",
      inputSchema: t.inputSchema || { type: "object", properties: {} },
    }));

    return {
      success: true,
      toolCount: tools.length,
      tools,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      toolCount: 0,
      tools: [],
      error: msg,
    };
  }
}

/**
 * Call a tool on an external MCP server.
 *
 * @param serverUrl - The external MCP server URL
 * @param toolName - The tool name (without prefix)
 * @param args - Tool arguments
 * @param authToken - Optional bearer token
 * @returns Tool result
 */
export async function callExternalTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  authToken?: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const headers: Record<string, string> = {
    "Accept": "application/json, text/event-stream",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    const transport = new StreamableHTTPClientTransport(
      new URL(serverUrl),
      { requestInit: { headers } },
    );

    const client = new Client(
      { name: "deltaai-mcp-client", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout")), 10_000);
    });
    await Promise.race([connectPromise, timeoutPromise]);

    // Call the tool
    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    await client.close();

    // Extract text content from MCP result
    const content = result.content as Array<{ type: string; text?: string }>;
    if (Array.isArray(content) && content.length > 0) {
      const textBlock = content.find((c) => c.type === "text");
      if (textBlock?.text) {
        // Try to parse as JSON, fallback to string
        try {
          return { success: true, data: JSON.parse(textBlock.text) };
        } catch {
          return { success: true, data: textBlock.text };
        }
      }
    }

    return { success: true, data: result.content };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────────
// External Tools Registry (loads from DB + caches)
// ─────────────────────────────────────────────────────────────

let _externalToolsCache: Map<string, ExternalTool> | null = null;

/**
 * Load all external tools from enabled MCP servers.
 * Returns a map of fullName → ExternalTool.
 *
 * The cache is rebuilt on every call (cheap — reads from DB).
 * For production, add a TTL cache.
 */
export async function loadExternalTools(): Promise<Map<string, ExternalTool>> {
  if (_externalToolsCache) return _externalToolsCache;

  const cache = new Map<string, ExternalTool>();

  try {
    const servers = await db.externalMcpServer.findMany({
      where: { isEnabled: true },
    });

    for (const server of servers) {
      if (!server.toolsCacheJson) continue;

      const toolNames = JSON.parse(server.toolsCacheJson) as Array<{
        name: string;
        description: string;
      }>;

      for (const t of toolNames) {
        const fullName = `${server.id}__${t.name}`;
        cache.set(fullName, {
          serverId: server.id,
          serverName: server.name,
          toolName: t.name,
          fullName,
          description: t.description,
          inputSchema: { type: "object", properties: {} },
        });
      }
    }
  } catch {
    // DB not available — return empty cache
  }

  _externalToolsCache = cache;
  return cache;
}

/** Clear the external tools cache (call after adding/removing servers). */
export function clearExternalToolsCache(): void {
  _externalToolsCache = null;
}

/**
 * Check if a tool name is an external tool (has the "serverId__toolName" format).
 */
export function isExternalTool(toolName: string): boolean {
  return toolName.includes("__");
}

/**
 * Parse an external tool name into serverId + toolName.
 */
export function parseExternalToolName(
  fullName: string,
): { serverId: string; toolName: string } | null {
  const parts = fullName.split("__");
  if (parts.length !== 2) return null;
  return { serverId: parts[0]!, toolName: parts[1]! };
}

/**
 * Execute an external tool by full name.
 * Looks up the server in DB, connects, and calls the tool.
 */
export async function executeExternalTool(
  fullName: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const parsed = parseExternalToolName(fullName);
  if (!parsed) {
    return { success: false, error: `Invalid external tool name: ${fullName}` };
  }

  try {
    const server = await db.externalMcpServer.findUnique({
      where: { id: parsed.serverId },
    });

    if (!server) {
      return { success: false, error: "External MCP server not found" };
    }

    if (!server.isEnabled) {
      return { success: false, error: "External MCP server is disabled" };
    }

    return await callExternalTool(
      server.url,
      parsed.toolName,
      args,
      server.authToken ?? undefined,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

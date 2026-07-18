/**
 * MCP Client — Official @modelcontextprotocol/sdk integration
 * ============================================================
 * Connects to MCP servers over two transports:
 *   1. StdioTransport  — spawns a local MCP server process (stdio JSON-RPC)
 *   2. SSETransport    — connects to a remote MCP server via Server-Sent Events
 *
 * The client exposes a unified `listTools()` and `callTool()` API so the
 * rest of the platform doesn't care which transport is in use.
 *
 * In addition, a "local" fallback is registered: the 60 built-in tools
 * from `tools-registry.ts` executed by `tool-executor.ts`. This means the
 * platform works out-of-the-box with zero external MCP servers, but can
 * transparently attach to any real MCP server when configured.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ALL_TOOLS, type MCPTool } from "./tools-registry";
import { executeTool, type ToolResult, type ToolEventEmitter } from "./tool-executor";

export type TransportKind = "stdio" | "sse" | "local";

export interface MCPConnectionConfig {
  kind: TransportKind;
  /** For stdio: the command to spawn, e.g. "node" */
  command?: string;
  /** For stdio: args to pass to the command */
  args?: string[];
  /** For sse: the remote server URL */
  url?: string;
  /** Environment variables for stdio */
  env?: Record<string, string>;
}

export interface RemoteTool {
  name: string;
  description: string;
  inputSchema: any;
  /** Origin server identifier */
  server: string;
}

/**
 * The unified MCP Client manager.
 * Holds one or more connections and aggregates their tools.
 */
export class MCPClientManager {
  private connections = new Map<string, { client: Client; config: MCPConnectionConfig }>();
  private remoteTools: RemoteTool[] = [];
  private localTools: MCPTool[] = ALL_TOOLS;
  private eventEmitter?: ToolEventEmitter;

  /** Allow the orchestrator to wire in event streaming. */
  setEventEmitter(emit: ToolEventEmitter) {
    this.eventEmitter = emit;
  }

  /**
   * Connect to an MCP server (stdio or sse).
   * Returns the list of tools discovered on that server.
   */
  async connect(id: string, config: MCPConnectionConfig): Promise<RemoteTool[]> {
    if (config.kind === "local") {
      // local tools are always available
      return this.localTools.map((t) => ({ ...t, server: "local" }));
    }

    const client = new Client(
      { name: "delta-ai-mcp-client", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    let transport: StdioClientTransport | SSEClientTransport;
    if (config.kind === "stdio") {
      transport = new StdioClientTransport({
        command: config.command ?? "node",
        args: config.args ?? [],
        env: config.env,
      });
    } else {
      transport = new SSEClientTransport(new URL(config.url!));
    }

    await client.connect(transport);
    this.connections.set(id, { client, config });

    try {
      const resp = await client.listTools();
      const tools: RemoteTool[] = (resp.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
        server: id,
      }));
      // merge into remote tools (replace existing for this server)
      this.remoteTools = [...this.remoteTools.filter((t) => t.server !== id), ...tools];
      return tools;
    } catch (e) {
      console.error(`[MCP] Failed to list tools from ${id}:`, e);
      return [];
    }
  }

  /** Disconnect a specific server. */
  async disconnect(id: string): Promise<void> {
    const conn = this.connections.get(id);
    if (conn) {
      await conn.client.close();
      this.connections.delete(id);
      this.remoteTools = this.remoteTools.filter((t) => t.server !== id);
    }
  }

  /** Disconnect all servers. */
  async disconnectAll(): Promise<void> {
    for (const id of [...this.connections.keys()]) await this.disconnect(id);
  }

  /**
   * List ALL available tools — local + remote.
   * This is what gets advertised to GLM.
   */
  listAllTools(): MCPTool[] {
    const local = this.localTools;
    const remote: MCPTool[] = this.remoteTools.map((t) => ({
      name: t.name,
      description: `[${t.server}] ${t.description}`,
      category: "data", // remote tools default to data category; could be extended
      inputSchema: t.inputSchema,
    }));
    return [...local, ...remote];
  }

  /**
   * Call a tool by name. Routes to the local executor first,
   * and falls back to the remote server that owns the tool.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    // 1. Try local first
    if (this.localTools.some((t) => t.name === name)) {
      return executeTool(name, args, this.eventEmitter);
    }
    // 2. Try remote
    const remote = this.remoteTools.find((t) => t.name === name);
    if (remote) {
      const conn = this.connections.get(remote.server);
      if (!conn) return { tool: name, success: false, output: null, error: `Server ${remote.server} not connected` };
      try {
        const result = await conn.client.callTool({ name, arguments: args });
        return {
          tool: name,
          success: !result.isError,
          output: result.content,
          meta: { server: remote.server },
          error: result.isError ? "Remote tool reported error" : undefined,
        };
      } catch (e: any) {
        return { tool: name, success: false, output: null, error: e.message };
      }
    }
    return { tool: name, success: false, output: null, error: `Tool not found: ${name}` };
  }

  /** Connection status summary for the UI. */
  status(): { servers: number; localTools: number; remoteTools: number; total: number } {
    return {
      servers: this.connections.size,
      localTools: this.localTools.length,
      remoteTools: this.remoteTools.length,
      total: this.localTools.length + this.remoteTools.length,
    };
  }
}

/** Singleton instance shared across the app. */
let _instance: MCPClientManager | null = null;
export function getMCPClient(): MCPClientManager {
  if (!_instance) _instance = new MCPClientManager();
  return _instance;
}

/**
 * Shared types for the DELTA AI frontend.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Tool calls that happened during this assistant turn. */
  toolCalls?: ToolExecution[];
  /** Reasoning/thinking content (if enabled). */
  thinking?: string;
  /** Inline artifacts detected by the streaming parser. */
  artifacts?: Artifact[];
  timestamp: number;
  streaming?: boolean;
}

export interface ToolExecution {
  id: string;
  tool: string;
  args?: unknown;
  result?: unknown;
  status: "running" | "success" | "error";
  error?: string;
}

export interface Artifact {
  kind: "file" | "media" | "thinking";
  name?: string;
  mime?: string;
  data: string;
}

/** SSE events coming from /api/chat */
export type SSEEvent =
  | { type: "status"; servers: number; localTools: number; remoteTools: number; total: number }
  | { type: "step"; step: number }
  | { type: "token"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_start"; tool: string; tool_call_id?: string; args?: unknown }
  | { type: "tool_end"; tool: string; tool_call_id?: string; result?: unknown }
  | { type: "done"; content?: string }
  | { type: "error"; error?: string };

export interface ToolCategory {
  category: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  tools: ToolDef[];
}

export interface ToolDef {
  name: string;
  description: string;
  category: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] };
}

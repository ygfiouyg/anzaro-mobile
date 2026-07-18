/**
 * Shared types for Anzaro AI Admin UI.
 */

export type Mode = "chat" | "admin" | "tools" | "skills";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolExecution[];
  thinking?: string;
  /** الـ skills اللي اتحملت تلقائياً للسؤال ده */
  loadedSkills?: string[];
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

export type SSEEvent =
  | { type: "status"; message?: string }
  | { type: "skills_loaded"; skills: string[] }
  | { type: "step"; step: number }
  | { type: "token"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_start"; tool: string; tool_call_id?: string; args?: unknown }
  | { type: "tool_end"; tool: string; tool_call_id?: string; result?: unknown }
  | { type: "done"; content?: string }
  | { type: "error"; error?: string };

export interface AdminTool {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] };
}

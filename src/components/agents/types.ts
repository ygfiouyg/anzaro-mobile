/**
 * Shared types for the Agent Builder UI.
 */

export interface CustomAgentMeta {
  id: string;
  name: string;
  nameEn: string | null;
  description: string;
  icon: string;
  color: string; // tailwind gradient classes e.g. "from-violet-500 to-fuchsia-500"
  systemPrompt: string;
  tools: string[];
  suggestions: string[];
  category: string;
  isPublic: boolean;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSSEEvent {
  type: "status" | "step" | "token" | "thinking" | "tool_start" | "tool_end" | "done" | "error";
  content?: string;
  tool?: string;
  tool_call_id?: string;
  args?: unknown;
  result?: unknown;
  step?: number;
  error?: string;
  message?: string;
}

export interface ToolCallRecord {
  id: string;
  tool: string;
  args?: unknown;
  result?: unknown;
  status: "running" | "done";
  startedAt: number;
  endedAt?: number;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallRecord[];
  thinking?: string;
  streaming?: boolean;
}

/** Gradient presets for the agent color picker */
export const COLOR_PRESETS: { label: string; value: string }[] = [
  { label: "بنفسجي-فوشيا", value: "from-violet-500 to-fuchsia-500" },
  { label: "أخضر-تيل", value: "from-emerald-500 to-teal-500" },
  { label: "وردي-برتقالي", value: "from-rose-500 to-orange-500" },
  { label: "سماوي-أزرق", value: "from-sky-500 to-blue-500" },
  { label: "كهرماني-أحمر", value: "from-amber-500 to-rose-500" },
  { label: "ليموني-أخضر", value: "from-lime-500 to-emerald-500" },
  { label: "بنفسجي-وردي", value: "from-purple-500 to-pink-500" },
  { label: "رمادي-أسود", value: "from-slate-600 to-slate-800" },
  { label: "ذهبي-برتقالي", value: "from-yellow-500 to-orange-600" },
  { label: "نيلي-بنفسجي", value: "from-indigo-500 to-purple-600" },
];

export const ICON_PRESETS = [
  "🤖", "✍️", "🔬", "💻", "📊", "📧", "🔧", "🎨",
  "💡", "📚", "🎯", "🚀", "⚡", "🧠", "🦾", "🌟",
  "🔍", "🌐", "📱", "🎓", "💼", "🛡️", "🎭", "🦊",
];

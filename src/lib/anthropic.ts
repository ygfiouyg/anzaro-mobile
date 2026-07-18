// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Anthropic Claude Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides AI access via Anthropic's Claude API:
//   - Chat/text generation (streaming + non-streaming)
//   - Claude Sonnet 4.5, Opus 4.1, Haiku 3.5
//   - Vision support (images)
//   - Extended thinking mode
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import Anthropic from "@anthropic-ai/sdk";
import { traceError, traceAPI } from "@/lib/trace-logger";

// ─── API Key ────────────────────────────────────────────────────────────
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// ─── Default Timeouts ──────────────────────────────────────────────────
const STREAM_TIMEOUT_MS = 300_000; // 5 min
const CHAT_TIMEOUT_MS = 60_000; // 1 min for non-streaming

// ─── Client singleton ──────────────────────────────────────────────────
let _client: Anthropic | null = null;

/** Get the Anthropic client singleton (creates if needed). */
export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Cannot use Claude models.");
  }
  _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return _client;
}

/** Check if Claude is available (API key configured). */
export function isClaudeAvailable(): boolean {
  return !!ANTHROPIC_API_KEY;
}

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type ClaudeModelId =
  | "claude-sonnet-4-5-20250929"
  | "claude-opus-4-1-20250805"
  | "claude-haiku-3-5-20241022";

export interface ClaudeChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ClaudeChatRequest {
  messages: ClaudeChatMessage[];
  model?: ClaudeModelId;
  temperature?: number;
  max_tokens?: number;
  system?: string;
  /** Enable extended thinking (Opus 4.1 / Sonnet 4.5). */
  enableThinking?: boolean;
  /** Token budget for thinking (if enabled). */
  thinkingBudget?: number;
}

export interface ClaudeChatStreamChunk {
  type: "content" | "thinking" | "done";
  content?: string;
  thinking?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPING
// ═══════════════════════════════════════════════════════════════════════

interface ClaudeModelMapping {
  claudeModel: ClaudeModelId;
  label: string;
  contextWindow: number;
  supportsVision: boolean;
  supportsThinking: boolean;
}

const MODEL_MAPPINGS: Record<string, ClaudeModelMapping> = {
  "delta-claude-sonnet": {
    claudeModel: "claude-sonnet-4-5-20250929",
    label: "Claude Sonnet 4.5",
    contextWindow: 200000,
    supportsVision: true,
    supportsThinking: true,
  },
  "delta-claude-opus": {
    claudeModel: "claude-opus-4-1-20250805",
    label: "Claude Opus 4.1",
    contextWindow: 200000,
    supportsVision: true,
    supportsThinking: true,
  },
  "delta-claude-haiku": {
    claudeModel: "claude-haiku-3-5-20241022",
    label: "Claude Haiku 3.5",
    contextWindow: 200000,
    supportsVision: true,
    supportsThinking: false,
  },
};

/** Get the Claude model mapping for a DeltaAI model name. */
export function getClaudeModelMapping(
  model: string,
): ClaudeModelMapping | null {
  return MODEL_MAPPINGS[model] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// STREAMING CHAT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Stream a chat completion from Claude.
 *
 * Converts DeltaAI messages → Anthropic Messages API format:
 *   - Extracts system messages (Claude uses a separate `system` param)
 *   - Converts remaining messages to [{role, content}]
 *
 * @yields ClaudeChatStreamChunk with type "content" (text) or "thinking" (reasoning)
 */
export async function* streamClaudeChat(
  request: ClaudeChatRequest,
): AsyncGenerator<ClaudeChatStreamChunk, void, unknown> {
  const {
    messages,
    model = "claude-sonnet-4-5-20250929",
    temperature = 0.7,
    max_tokens = 8192,
    system: explicitSystem,
    enableThinking = false,
    thinkingBudget = 5000,
  } = request;

  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  // ── Extract system message ──────────────────────────────────
  let systemPrompt = explicitSystem ?? "";
  const chatMessages: Array<{ role: "user" | "assistant"; content: string }> =
    [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${msg.content}`
        : msg.content;
    } else {
      chatMessages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  // Claude requires at least one user message
  if (chatMessages.length === 0) {
    throw new Error("Claude requires at least one user or assistant message");
  }

  traceAPI(
    `[Claude] Streaming chat: model=${model}, messages=${chatMessages.length}, system=${systemPrompt.length} chars`,
  );

  const client = getAnthropicClient();

  // ── Build request params ────────────────────────────────────
  const params: Anthropic.MessageStreamParams = {
    model,
    max_tokens,
    temperature,
    messages: chatMessages,
    ...(systemPrompt ? { system: systemPrompt } : {}),
  };

  // ── Extended thinking (if enabled and supported) ────────────
  if (enableThinking) {
    params.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudget,
    };
    // When thinking is enabled, temperature must be 1
    params.temperature = 1;
  }

  // ── Stream ──────────────────────────────────────────────────
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  try {
    const stream = await client.messages.stream(params, {
      signal: controller.signal,
    });

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start":
          // Could be text or thinking block
          if (event.content_block.type === "thinking") {
            // Thinking block started — will receive deltas
          }
          break;

        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            yield {
              type: "content",
              content: event.delta.text,
            };
          } else if (event.delta.type === "thinking_delta") {
            yield {
              type: "thinking",
              thinking: event.delta.thinking,
            };
          }
          break;

        case "message_stop":
          yield { type: "done" };
          break;
      }
    }
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : String(error);
    traceError(`[Claude] Streaming error: ${errMsg.slice(0, 200)}`);

    // Don't yield error as content — let the caller handle it
    if (controller.signal.aborted) {
      throw new Error("Claude stream timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NON-STREAMING CHAT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Non-streaming chat completion (for quick responses).
 */
export async function claudeChat(
  request: ClaudeChatRequest,
): Promise<{ content: string; thinking?: string }> {
  const {
    messages,
    model = "claude-sonnet-4-5-20250929",
    temperature = 0.7,
    max_tokens = 4096,
    system: explicitSystem,
    enableThinking = false,
    thinkingBudget = 5000,
  } = request;

  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  let systemPrompt = explicitSystem ?? "";
  const chatMessages: Array<{ role: "user" | "assistant"; content: string }> =
    [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${msg.content}`
        : msg.content;
    } else {
      chatMessages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  const client = getAnthropicClient();

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens,
    temperature: enableThinking ? 1 : temperature,
    messages: chatMessages,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(enableThinking
      ? { thinking: { type: "enabled", budget_tokens: thinkingBudget } }
      : {}),
  };

  const response = await client.messages.create(params, {
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });

  let content = "";
  let thinking = "";

  for (const block of response.content) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "thinking") {
      thinking += block.thinking;
    }
  }

  return { content, thinking };
}

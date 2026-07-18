/**
 * Multi-Modal Tool Router
 * ========================
 * Intercepts user messages, detects intent, and selects the right tools
 * from the 300+ registry WITHOUT blowing up the context window.
 *
 * Architecture:
 *   1. Intent Classifier (fast regex + keyword matching — no LLM call)
 *   2. Tool Selector (selects 5-10 relevant tools from 300+)
 *   3. Multi-Modal Detector (detects images/files in the message)
 *   4. Stream with Vercel AI SDK pattern (maxSteps for tool chaining)
 *
 * Context Window Protection:
 *   - 300 tools × 300 tokens = 90,000 tokens (TOO MUCH)
 *   - We send only 5-10 tools = 1,500-3,000 tokens (SAFE)
 *   - The 3 multi-modal tools are ALWAYS included
 */

import type { MCPTool } from "./types";

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface UserMessage {
  text: string;
  images?: Array<{ url: string; mimeType?: string }>;
  files?: Array<{ url: string; mimeType?: string; name?: string }>;
}

export interface IntentFlags {
  needsMath: boolean;
  needsVision: boolean;
  needsDocument: boolean;
  needsSearch: boolean;
  needsCode: boolean;
  needsMedia: boolean;
  isCasual: boolean; // just chatting, no tools needed
}

export interface RoutedTools {
  tools: MCPTool[];
  intent: IntentFlags;
  multimodal: {
    hasImages: boolean;
    hasFiles: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. INTENT CLASSIFIER (no LLM call — pure regex/keyword)
// ═══════════════════════════════════════════════════════════════════════

export function classifyIntent(message: string): IntentFlags {
  const lower = message.toLowerCase();

  // Math indicators
  const mathPatterns = /\b(calculate|compute|solve|equation|integral|derivative|matrix|multiply|divide|percentage|sqrt|log|sin|cos|tan|sum|average|mean|median|std|حسب|احسب|اجمع|اطرح|اضرب|اقسم|نسبة|مئوي|متوسط|جمع|طرح|ضرب|قسمة|معادلة|تكامل|تفاضل|مصفوفة)\b/i;
  const hasNumbers = /\d+\s*[+\-*/×÷^%]/.test(message) || /\d/.test(message);

  // Vision indicators
  const visionPatterns = /\b(image|photo|picture|screenshot|see|look|vision|describe.*image|what.*in.*image|صورة|صوره|رسم|شاشة|شاهد|انظر|وصف.*صورة|ايه.*في.*الصورة)\b/i;

  // Document indicators
  const docPatterns = /\b(pdf|document|file|doc|docx|parse|summarize.*document|read.*file|ملف|مستند|pdf|اقرأ.*ملف|لخص.*مستند)\b/i;

  // Search indicators
  const searchPatterns = /\b(search|google|find|lookup|web|internet|بحث|جوجل|بحث|ابحث|دور|في.*النت|الانترنت)\b/i;

  // Code indicators
  const codePatterns = /\b(code|function|debug|program|python|javascript|typescript|react|api|كود|دالة|برمج|debug|بايثون|جافا)\b/i;

  // Media indicators
  const mediaPatterns = /\b(play|music|song|radio|video|youtube|spotify|شغل|اغني|اغنية|راديو|فيديو|يوتيوب|موسيقى)\b/i;

  return {
    needsMath: mathPatterns.test(lower) || (hasNumbers && /(\+|\-|\*|\/|×|÷|%)/.test(message)),
    needsVision: visionPatterns.test(lower),
    needsDocument: docPatterns.test(lower),
    needsSearch: searchPatterns.test(lower),
    needsCode: codePatterns.test(lower),
    needsMedia: mediaPatterns.test(lower),
    isCasual: !mathPatterns.test(lower) && !visionPatterns.test(lower) &&
              !docPatterns.test(lower) && !searchPatterns.test(lower) &&
              !codePatterns.test(lower) && !mediaPatterns.test(lower) &&
              message.length < 100,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 2. TOOL SELECTOR — select 5-10 relevant tools from 300+
// ═══════════════════════════════════════════════════════════════════════

// The 3 multi-modal tools are ALWAYS included
const ALWAYS_INCLUDE = ['execute_python', 'analyze_image', 'parse_document'];

// Tool name → when to include
const TOOL_TRIGGERS: Record<string, string[]> = {
  // Math
  'execute_python': ['math', 'always'],
  // Vision
  'analyze_image': ['vision', 'image', 'always'],
  // Document
  'parse_document': ['document', 'file', 'always'],
  // Search
  'web_search': ['search'],
  'page_read': ['search', 'read'],
  'web_scrape': ['search', 'scrape'],
  // Code
  'code_exec': ['code'],
  'code_review': ['code', 'review'],
  // Media
  'image_generate': ['media', 'image-gen'],
  'tts_generate': ['media', 'tts'],
  'video_generate': ['media', 'video-gen'],
  'youtube_search': ['media', 'youtube'],
  'youtube_analyze': ['media', 'youtube'],
  // Documents
  'document_generate': ['document', 'pdf-gen'],
  'summarize': ['document', 'summarize'],
  'translate': ['translate'],
};

export function selectTools(
  intent: IntentFlags,
  allTools: Map<string, MCPTool>
): MCPTool[] {
  const selected = new Set<string>();

  // Always include the 3 multi-modal tools
  for (const name of ALWAYS_INCLUDE) {
    if (allTools.has(name)) selected.add(name);
  }

  // Add tools based on intent
  if (intent.needsSearch) {
    ['web_search', 'page_read', 'web_scrape'].forEach(n => {
      if (allTools.has(n)) selected.add(n);
    });
  }

  if (intent.needsCode) {
    ['code_exec', 'code_review'].forEach(n => {
      if (allTools.has(n)) selected.add(n);
    });
  }

  if (intent.needsMedia) {
    ['image_generate', 'tts_generate', 'video_generate', 'youtube_search', 'youtube_analyze'].forEach(n => {
      if (allTools.has(n)) selected.add(n);
    });
  }

  if (intent.needsDocument) {
    ['document_generate', 'summarize', 'parse_document'].forEach(n => {
      if (allTools.has(n)) selected.add(n);
    });
  }

  // If casual chat, only include the 3 multi-modal tools (already added)
  // This keeps the context minimal for simple conversations

  // Convert to array and limit to 10 tools max
  const toolNames = [...selected].slice(0, 10);
  return toolNames
    .map(name => allTools.get(name))
    .filter((t): t is MCPTool => !!t);
}

// ═══════════════════════════════════════════════════════════════════════
// 3. MULTI-MODAL DETECTOR
// ═══════════════════════════════════════════════════════════════════════

export function detectMultimodal(message: UserMessage): RoutedTools['multimodal'] {
  return {
    hasImages: (message.images?.length || 0) > 0,
    hasFiles: (message.files?.length || 0) > 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 4. MAIN ROUTER — orchestrates the full flow
// ═══════════════════════════════════════════════════════════════════════

export async function routeMessage(
  message: UserMessage,
  allTools: Map<string, MCPTool>
): Promise<RoutedTools> {
  // 1. Classify intent
  const intent = classifyIntent(message.text);

  // 2. Detect multi-modal content
  const multimodal = detectMultimodal(message);

  // 3. If images present, force vision intent
  if (multimodal.hasImages) {
    intent.needsVision = true;
  }

  // 4. If files present, force document intent
  if (multimodal.hasFiles) {
    intent.needsDocument = true;
  }

  // 5. Select relevant tools
  const tools = selectTools(intent, allTools);

  return {
    tools,
    intent,
    multimodal,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 5. VERCEL AI SDK INTEGRATION PATTERN
// ═══════════════════════════════════════════════════════════════════════
// This is the pattern for using the routed tools with Vercel AI SDK.
// The user should integrate this into their existing chat stream route.
// ═══════════════════════════════════════════════════════════════════════

export const VERCEL_AI_SDK_PATTERN = `
// ─── Integration Pattern (paste into your chat stream route) ───────────
//
// import { streamText } from 'ai';
// import { routeMessage } from '@/lib/mcp/multimodal-router';
// import { getToolRegistry } from '@/lib/mcp/registry';
//
// export async function POST(req: Request) {
//   const { message, images, files, modelId } = await req.json();
//
//   // 1. Load ALL tools from registry (lazy-loaded)
//   const allTools = await getToolRegistry();
//
//   // 2. Route: classify intent + select 5-10 relevant tools
//   const { tools, intent, multimodal } = await routeMessage(
//     { text: message, images, files },
//     allTools
//   );
//
//   // 3. Convert MCP tools to Vercel AI SDK format
//   const aiTools = Object.fromEntries(
//     tools.map(t => [t.name, {
//       description: t.description,
//       parameters: t.parameters,
//       execute: async (params) => {
//         const result = await t.execute(params);
//         return JSON.stringify(result);
//       }
//     }])
//   );
//
//   // 4. Build multi-modal content (text + images + files)
//   const content = [
//     { type: 'text', text: message },
//     ...(images || []).map(img => ({
//       type: 'image',
//       image: img.url,
//     })),
//   ];
//
//   // 5. Stream with tool calling (maxSteps allows chaining)
//   const result = streamText({
//     model: getModel(modelId), // your provider
//     messages: [{ role: 'user', content }],
//     tools: aiTools,
//     maxSteps: 5, // allows up to 5 tool calls in sequence
//   });
//
//   return result.toDataStreamResponse();
// }
`;

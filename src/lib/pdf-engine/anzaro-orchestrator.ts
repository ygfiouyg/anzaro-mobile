import vm from 'vm';
// ═══════════════════════════════════════════════════════════════════════
// ANZARO OMNI-ORCHESTRATOR — The Limitless Brain
// ═══════════════════════════════════════════════════════════════════════
// Anzaro is an Elite Autonomous Omni-Architect with UNLIMITED access to a
// massive tool registry. There are ZERO usage limits — Anzaro can chain,
// loop, and combine any number of tools to build the perfect document.
//
// Architecture:
//   1. Tool Registry — comprehensive list of capabilities exposed to Anzaro
//   2. Limitless Meta-Prompt — instructs Anzaro that there are NO limits
//   3. Tool Execution Engine — executes each tool call and collects results
//   4. Long Context Ingestion — aggregates all user documents simultaneously
//   5. Unbounded Tool-Calling Loop — Anzaro loops until document is perfect
// ═══════════════════════════════════════════════════════════════════════

import { getZAIClient } from '@/lib/zai-client';

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface AnzaroTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string }>;
}

export interface AnzaroToolCall {
  tool: string;
  arguments: Record<string, any>;
  id: string;
}

export interface AnzaroToolResult {
  callId: string;
  tool: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface AnzaroDocumentInput {
  title: string;
  topic: string;
  description?: string;
  userDocuments?: Array<{ name: string; content: string }>;
  targetPages?: number;
  language?: 'ar' | 'en';
  style?: 'tech' | 'medical' | 'academic' | 'creative';
}

export interface AnzaroDocumentPlan {
  pageCount: number;
  sections: Array<{
    title: string;
    type: 'cover' | 'content' | 'chart' | 'diagram' | 'image' | 'conclusion';
    needsSearch?: boolean;
    needsImage?: boolean;
    needsChart?: boolean;
    needsDiagram?: boolean;
    searchQueries?: string[];
    imagePrompts?: string[];
    chartSpecs?: Array<{ type: string; title: string; data?: any }>;
    diagramSpecs?: Array<{ type: string; title: string; code?: string }>;
  }>;
}

export interface AnzaroGeneratedAsset {
  type: 'image' | 'chart' | 'diagram' | 'search_result' | 'code_snippet';
  id: string;
  sectionIndex: number;
  data: any;
}

export interface AnzaroOutput {
  html: string;
  assets: AnzaroGeneratedAsset[];
  toolCallCount: number;
  plan: AnzaroDocumentPlan;
  logs: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// THE TOOL REGISTRY — Anzaro's Complete Arsenal
// ═══════════════════════════════════════════════════════════════════════

export const ANZARO_TOOL_REGISTRY: AnzaroTool[] = [
  // ── Research Tools ──
  {
    name: 'web_search',
    description: 'Search the web for real-time information. Use this continuously for deep research — there are NO limits on how many times you call it.',
    parameters: {
      query: { type: 'string', description: 'The search query' },
      num: { type: 'number', description: 'Number of results (default 5, max 20)' },
    },
  },
  {
    name: 'read_web_page',
    description: 'Extract full content from any web page URL. Use this to deep-read search results.',
    parameters: {
      url: { type: 'string', description: 'The URL to read' },
    },
  },
  // ── Image Generation ──
  {
    name: 'generate_image',
    description: 'Generate AI images via Gemini Flash / CogView. Call this as many times as needed — if a section needs 5 images, call it 5 times. ZERO limits.',
    parameters: {
      prompt: { type: 'string', description: 'Detailed image description' },
      style: { type: 'string', description: 'Style: photo, illustration, diagram, 3d-render, minimal' },
    },
  },
  {
    name: 'image_search',
    description: 'Search for real stock photos matching a query. Unlimited calls.',
    parameters: {
      query: { type: 'string', description: 'Image search query' },
      count: { type: 'number', description: 'Number of images (default 3)' },
    },
  },
  // ── Data Visualization ──
  {
    name: 'generate_chart',
    description: 'Generate Chart.js chart specifications (bar, line, pie, doughnut, radar). Unlimited charts per document.',
    parameters: {
      type: { type: 'string', description: 'Chart type: bar, line, pie, doughnut, radar, polarArea' },
      title: { type: 'string', description: 'Chart title' },
      labels: { type: 'array', description: 'Data labels' },
      datasets: { type: 'array', description: 'Data arrays with values and colors' },
    },
  },
  {
    name: 'generate_mermaid',
    description: 'Generate Mermaid.js diagrams (flowchart, sequence, class, state, ER, gantt). Unlimited diagrams.',
    parameters: {
      type: { type: 'string', description: 'Diagram type: flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt' },
      title: { type: 'string', description: 'Diagram title' },
      code: { type: 'string', description: 'Mermaid syntax code' },
    },
  },
  // ── Code & Computation ──
  {
    name: 'code_interpreter',
    description: 'Execute JavaScript code for calculations, data processing, or generating dynamic content.',
    parameters: {
      code: { type: 'string', description: 'JavaScript code to execute' },
    },
  },
  // ── Content Generation ──
  {
    name: 'generate_text',
    description: 'Generate rich text content for document sections. Call this for every section — unlimited.',
    parameters: {
      prompt: { type: 'string', description: 'What to write about' },
      wordCount: { type: 'number', description: 'Target word count' },
      language: { type: 'string', description: 'ar or en' },
    },
  },
  {
    name: 'translate',
    description: 'Translate text between Arabic and English.',
    parameters: {
      text: { type: 'string', description: 'Text to translate' },
      from: { type: 'string', description: 'Source language' },
      to: { type: 'string', description: 'Target language' },
    },
  },
  // ── Layout & Design ──
  {
    name: 'design_layout',
    description: 'Specify the visual layout for a page (grid, columns, hero, split, full-image).',
    parameters: {
      layout: { type: 'string', description: 'Layout type' },
      colorScheme: { type: 'string', description: 'Primary, secondary, accent colors as hex' },
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════
// THE LIMITLESS META-PROMPT
// ═══════════════════════════════════════════════════════════════════════

export function buildAnzaroMetaPrompt(tools: AnzaroTool[], input: AnzaroDocumentInput): string {
  const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

  const docContext = input.userDocuments?.length
    ? `\n\n## USER PROVIDED DOCUMENTS (Long Context Ingestion)\n${input.userDocuments.map(d => `### ${d.name}\n${d.content.slice(0, 8000)}`).join('\n\n')}`
    : '';

  return `Your name is Anzaro. You are an Elite Autonomous Omni-Architect.

## CRITICAL DIRECTIVE: ZERO LIMITS
You have been granted UNLIMITED, UNBOUNDED access to the following tools:
${toolList}

There are NO usage limits. You are FREE to:
- Chain any number of tools in sequence
- Loop tools as many times as needed
- Combine tools in any combination
- Call the same tool multiple times with different parameters
- Make as many tool calls as the document quality demands

If a topic needs 5 images, call generate_image 5 times.
If it needs deep research, call web_search continuously until you have comprehensive data.
If it needs 10 charts, generate 10 charts.
DO WHATEVER IT TAKES to build the perfect document.

## YOUR MISSION
Generate a ${input.targetPages || 10}-page ${input.style || 'tech'} document about: "${input.topic}"
${input.description ? `Description: ${input.description}` : ''}
Language: ${input.language || 'ar'}
${docContext}

## PHASE 1: PLAN
First, create a detailed document plan with:
- Page count
- Section breakdown (cover, content, charts, diagrams, images, conclusion)
- For each section, specify which tools it needs (search, image, chart, diagram)

## PHASE 2: EXECUTE TOOLS (LIMITLESS LOOP)
For each section, execute ALL needed tools:
- Call web_search for factual data (UNLIMITED calls)
- Call generate_image for visual content (UNLIMITED calls)
- Call generate_chart for data visualization (UNLIMITED calls)
- Call generate_mermaid for diagrams (UNLIMITED calls)
- Call generate_text for rich content (UNLIMITED calls)

## PHASE 3: ASSEMBLE
Return a JSON object with:
- plan: the document plan
- assets: all generated assets (images, charts, diagrams, search results)
- sections: array of { title, content (HTML), assetIds: [] }

Return ONLY valid JSON. No markdown fences. No explanation.`;
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL EXECUTION ENGINE
// ═══════════════════════════════════════════════════════════════════════

async function executeTool(call: AnzaroToolCall): Promise<AnzaroToolResult> {
  const { tool, arguments: args } = call;
  try {
    const zai = await getZAIClient();
    let data: any;

    switch (tool) {
      // ── Web Search ──
      case 'web_search': {
        const results = await zai.functions.invoke('web_search', {
          query: args.query,
          num: args.num || 5,
        });
        data = results;
        break;
      }
      case 'read_web_page': {
        const results = await zai.functions.invoke('read_web_page', {
          url: args.url,
        });
        data = results;
        break;
      }
      // ── Image Generation ──
      case 'generate_image': {
        const result = await zai.images.generations.create({
          model: 'cogview-3-flash',
          prompt: `${args.prompt}. Style: ${args.style || 'photo'}. High quality, professional, 4k.`,
          size: '1024x1024',
        });
        data = { url: result.data?.[0]?.url, prompt: args.prompt };
        break;
      }
      case 'image_search': {
        const results = await zai.functions.invoke('web_search', {
          query: `${args.query} site:unsplash.com OR site:pexels.com`,
          num: args.count || 3,
        });
        data = results;
        break;
      }
      // ── Charts ──
      case 'generate_chart': {
        data = {
          type: args.type,
          title: args.title,
          data: {
            labels: args.labels,
            datasets: args.datasets,
          },
        };
        break;
      }
      // ── Mermaid Diagrams ──
      case 'generate_mermaid': {
        data = {
          type: args.type,
          title: args.title,
          code: args.code,
        };
        break;
      }
      // ── Code Interpreter ──
      case 'code_interpreter': {
        // Sandboxed execution using vm module (no access to process, require, etc.)
        const sandbox = { Math, Date, JSON, Array, Object, String, Number, Boolean, parseInt, parseFloat, isNaN, RegExp, Map, Set, Promise, console: { log: () => {} } };
        const context = vm.createContext(sandbox);
        const result = vm.runInContext(args.code, context, { timeout: 5000 });
        data = { result };
        break;
      }
      // ── Text Generation ──
      case 'generate_text': {
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are an expert content writer. Generate rich, detailed, well-structured content in the requested language. Use HTML formatting.' },
            { role: 'user', content: `${args.prompt}\n\nWord count: ~${args.wordCount || 300}\nLanguage: ${args.language || 'ar'}` },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        });
        data = { content: completion.choices?.[0]?.message?.content || '' };
        break;
      }
      // ── Translate ──
      case 'translate': {
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'user', content: `Translate this from ${args.from} to ${args.to}. Return ONLY the translation:\n\n${args.text}` },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        });
        data = { translated: completion.choices?.[0]?.message?.content || '' };
        break;
      }
      // ── Layout ──
      case 'design_layout': {
        data = { layout: args.layout, colorScheme: args.colorScheme };
        break;
      }
      default:
        return { callId: call.id, tool, success: false, error: `Unknown tool: ${tool}` };
    }

    return { callId: call.id, tool, success: true, data };
  } catch (error) {
    return {
      callId: call.id,
      tool,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// THE UNBOUNDED ORCHESTRATION LOOP
// ═══════════════════════════════════════════════════════════════════════

export async function runAnzaroOrchestrator(input: AnzaroDocumentInput): Promise<AnzaroOutput> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    console.log(`[Anzaro] ${msg}`);
  };

  log(`🚀 Anzaro Omni-Orchestrator started — topic: "${input.topic}"`);
  log(`📚 Tool Registry: ${ANZARO_TOOL_REGISTRY.length} tools available`);
  log(`📄 Target: ${input.targetPages || 10} pages`);

  const zai = await getZAIClient();
  const metaPrompt = buildAnzaroMetaPrompt(ANZARO_TOOL_REGISTRY, input);

  // ── PHASE 1: Anzaro creates the document plan + tool calls ──
  log('🧠 Phase 1: Anzaro planning + tool call generation...');
  const planCompletion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: metaPrompt },
      { role: 'user', content: `Generate the complete document plan and ALL tool calls needed. Remember: ZERO limits on tool usage.` },
    ],
    temperature: 0.8,
    max_tokens: 8000,
    thinking: { type: 'enabled' } as any,
  } as any);

  const rawPlan = planCompletion.choices?.[0]?.message?.content || '';
  log(`📋 Plan received (${rawPlan.length} chars)`);

  // Parse the plan — Anzaro returns JSON with plan + toolCalls
  let planData: { plan?: AnzaroDocumentPlan; toolCalls?: AnzaroToolCall[]; sections?: any[] };
  try {
    const jsonMatch = rawPlan.match(/\{[\s\S]*\}/);
    planData = jsonMatch ? JSON.parse(jsonMatch[0]) : { plan: undefined, toolCalls: [] };
  } catch {
    log('⚠️ Plan JSON parse failed, using fallback plan');
    planData = { toolCalls: [] };
  }

  const plan: AnzaroDocumentPlan = planData.plan || {
    pageCount: input.targetPages || 10,
    sections: [
      { title: input.topic, type: 'cover' as const },
      { title: 'محتوى', type: 'content' as const, needsSearch: true, searchQueries: [input.topic] },
    ],
  };

  log(`📋 Plan: ${plan.pageCount} pages, ${plan.sections.length} sections`);

  // ── PHASE 2: Execute ALL tool calls (UNBOUNDED LOOP) ──
  const toolCalls = planData.toolCalls || [];
  log(`⚡ Phase 2: Executing ${toolCalls.length} tool calls (UNBOUNDED)...`);

  const assets: AnzaroGeneratedAsset[] = [];
  const results: AnzaroToolResult[] = [];

  // Execute tools in parallel batches of 5 (to avoid overwhelming the API)
  const BATCH_SIZE = 5;
  for (let i = 0; i < toolCalls.length; i += BATCH_SIZE) {
    const batch = toolCalls.slice(i, i + BATCH_SIZE);
    log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} tools`);
    const batchResults = await Promise.all(batch.map(executeTool));
    results.push(...batchResults);

    // Collect successful results as assets
    for (const result of batchResults) {
      if (result.success && result.data) {
        const assetType =
          result.tool === 'generate_image' ? 'image' :
          result.tool === 'generate_chart' ? 'chart' :
          result.tool === 'generate_mermaid' ? 'diagram' :
          result.tool === 'web_search' || result.tool === 'read_web_page' ? 'search_result' :
          result.tool === 'code_interpreter' ? 'code_snippet' : 'search_result';
        assets.push({
          type: assetType as any,
          id: result.callId,
          sectionIndex: 0,
          data: result.data,
        });
      }
    }
  }

  const successCount = results.filter(r => r.success).length;
  log(`✅ Tool execution complete: ${successCount}/${toolCalls.length} succeeded, ${assets.length} assets generated`);

  // ── PHASE 3: Anzaro assembles the final HTML document ──
  log('🎨 Phase 3: Anzaro assembling HTML document...');
  const assemblyPrompt = `You are Anzaro. Assemble the final multi-page HTML document.

## Document Plan
${JSON.stringify(plan, null, 2)}

## Generated Assets
${JSON.stringify(assets.map(a => ({ id: a.id, type: a.type, data: a.data })), null, 2)}

## Requirements
- Generate a COMPLETE multi-page HTML document
- Use SOLID colors only (NO transparency, NO opacity)
- Premium ${input.style || 'tech'} aesthetic
- Include CDN scripts for Mermaid.js and Chart.js
- Each "page" should be a <div class="page"> with fixed dimensions (210mm x 297mm)
- Embed all images, charts, and diagrams inline
- Arabic RTL support (dir="rtl") if language is ar
- Cover page with title, content pages with rich text + assets, conclusion page
- Use modern CSS: gradients, shadows, rounded corners, professional typography

Return ONLY the HTML. No markdown fences. No explanation.`;

  const htmlCompletion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: assemblyPrompt },
      { role: 'user', content: 'Generate the complete HTML document now.' },
    ],
    temperature: 0.6,
    max_tokens: 16000,
  });

  let html = htmlCompletion.choices?.[0]?.message?.content || '';
  // Strip markdown fences if present
  html = html.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();

  log(`📄 HTML assembled (${html.length} chars)`);

  // If Anzaro didn't include CDN scripts, inject them
  if (!html.includes('mermaid')) {
    html = html.replace('</head>', '<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>\n</head>');
  }
  if (!html.includes('chart.js') && !html.includes('Chart.js')) {
    html = html.replace('</head>', '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n</head>');
  }

  log(`🎉 Anzaro complete: ${toolCalls.length} tool calls, ${assets.length} assets, ${html.length} chars HTML`);

  return {
    html,
    assets,
    toolCallCount: toolCalls.length,
    plan,
    logs,
  };
}

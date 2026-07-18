/**
 * GET /api/audit-tools
 * POST /api/audit-tools
 * =====================
 * The "Ghost Hunter" — Automated Tool Registry Auditor.
 *
 * Systematically stress-tests EVERY tool in the MCP registry:
 * 1. Ingests the full tool registry (lazy-loaded)
 * 2. Generates mock parameters for each tool's schema
 * 3. Executes each tool with mock params (try/catch)
 * 4. Returns a health report: WORKING / DISCONNECTED / BROKEN
 *
 * Query params:
 *   ?tool=<name>  — audit a single tool
 *   ?timeout=5000 — per-tool timeout in ms (default 5000)
 */

import { NextRequest, NextResponse } from 'next/server';
import { listToolNames, getTool, type MCPTool } from '@/lib/mcp/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min for full audit

interface AuditResult {
  name: string;
  description: string;
  status: 'WORKING' | 'DISCONNECTED' | 'BROKEN';
  error?: string;
  stack?: string;
  durationMs: number;
  mockParams: Record<string, unknown>;
}

interface AuditReport {
  total: number;
  working: number;
  disconnected: number;
  broken: number;
  results: AuditResult[];
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════
// MOCK PARAMETER GENERATOR
// ═══════════════════════════════════════════════════════════════════════

function generateMockValue(
  paramName: string,
  paramType: string,
  paramDesc: string,
  enumValues?: string[]
): unknown {
  if (enumValues && enumValues.length > 0) return enumValues[0];

  const lowerName = paramName.toLowerCase();
  const lowerDesc = (paramDesc || '').toLowerCase();

  if (paramType === 'string') {
    if (lowerName.includes('query') || lowerName.includes('search') || lowerName.includes('q')) return 'artificial intelligence';
    if (lowerName.includes('city') || lowerName.includes('location')) return 'Cairo';
    if (lowerName.includes('url') || lowerName.includes('link')) return 'https://example.com';
    if (lowerName.includes('email')) return 'test@example.com';
    if (lowerName.includes('code') || lowerName.includes('snippet')) return 'console.log("hello")';
    if (lowerName.includes('language') || lowerName.includes('lang')) return 'ar';
    if (lowerName.includes('text') || lowerName.includes('content') || lowerName.includes('message')) return 'Sample text for testing';
    if (lowerName.includes('name') || lowerName.includes('title')) return 'Test';
    if (lowerName.includes('color') || lowerName.includes('theme')) return 'blue';
    if (lowerName.includes('image') || lowerName.includes('prompt')) return 'a beautiful sunset';
    if (lowerDesc.includes('json')) return '{}';
    return 'test';
  }

  if (paramType === 'number') {
    if (lowerName.includes('limit') || lowerName.includes('count') || lowerName.includes('num')) return 5;
    if (lowerName.includes('lat') || lowerName.includes('latitude')) return 30.0444;
    if (lowerName.includes('lon') || lowerName.includes('lng') || lowerName.includes('longitude')) return 31.2357;
    if (lowerName.includes('id')) return 1;
    return 1;
  }

  if (paramType === 'boolean') return false;
  if (paramType === 'array') return [];
  if (paramType === 'object') return {};
  return null;
}

function generateMockParams(tool: MCPTool): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const properties = tool.parameters?.properties || {};

  for (const [name, schema] of Object.entries(properties)) {
    const s = schema as any;
    params[name] = generateMockValue(name, s.type || 'string', s.description || '', s.enum);
  }

  if (Object.keys(params).length === 0) {
    params.query = 'test';
  }

  return params;
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL EXECUTION WITH TIMEOUT
// ═══════════════════════════════════════════════════════════════════════

async function executeWithTimeout(
  tool: MCPTool,
  params: Record<string, unknown>,
  timeoutMs: number
): Promise<{ result: any; durationMs: number }> {
  const startTime = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  const executePromise = (async () => {
    const result = await tool.execute(params);
    return { result, durationMs: Date.now() - startTime };
  })();

  return Promise.race([executePromise, timeoutPromise]);
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIT SINGLE TOOL
// ═══════════════════════════════════════════════════════════════════════

async function auditTool(name: string, timeoutMs: number): Promise<AuditResult> {
  const startTime = Date.now();

  // Step 1: Try to load the tool
  let tool: MCPTool | undefined;
  try {
    tool = await getTool(name);
  } catch (e: any) {
    return {
      name, description: '(failed to load)', status: 'DISCONNECTED',
      error: `Import failed: ${e.message}`,
      stack: e.stack?.split('\n').slice(0, 3).join('\n'),
      durationMs: Date.now() - startTime, mockParams: {},
    };
  }

  if (!tool) {
    return {
      name, description: '(not found)', status: 'DISCONNECTED',
      error: 'Tool loader missing or TOOL_META mismatch',
      durationMs: Date.now() - startTime, mockParams: {},
    };
  }

  // Step 2: Generate mock parameters
  const mockParams = generateMockParams(tool);

  // Step 3: Execute with timeout
  try {
    const { result, durationMs } = await executeWithTimeout(tool, mockParams, timeoutMs);

    // Step 4: Validate result
    if (result && typeof result === 'object' && 'success' in result) {
      if (result.success) {
        return { name, description: tool.description?.slice(0, 80) || '', status: 'WORKING', durationMs, mockParams };
      } else {
        const errMsg = result.error || 'Unknown error';
        const isMissingKey = /key|token|api|auth|unauthorized|401|403/i.test(errMsg);
        return {
          name, description: tool.description?.slice(0, 80) || '',
          status: isMissingKey ? 'DISCONNECTED' : 'BROKEN',
          error: errMsg.slice(0, 200), durationMs, mockParams,
        };
      }
    }

    return {
      name, description: tool.description?.slice(0, 80) || '',
      status: 'DISCONNECTED', error: `Unexpected result type: ${typeof result}`,
      durationMs, mockParams,
    };
  } catch (e: any) {
    return {
      name, description: tool.description?.slice(0, 80) || '',
      status: 'BROKEN', error: e.message?.slice(0, 200) || 'Unknown error',
      stack: e.stack?.split('\n').slice(0, 5).join('\n'),
      durationMs: Date.now() - startTime, mockParams,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const singleTool = searchParams.get('tool');
  const timeoutMs = parseInt(searchParams.get('timeout') || '5000', 10);
  const reportStartTime = Date.now();

  const allToolNames = listToolNames();

  if (allToolNames.length === 0) {
    return NextResponse.json({ error: 'No tools found in registry', total: 0 }, { status: 500 });
  }

  // Single tool audit
  if (singleTool) {
    const result = await auditTool(singleTool, timeoutMs);
    return NextResponse.json({ tool: singleTool, ...result });
  }

  // Full audit — process in batches of 10
  const BATCH_SIZE = 10;
  const results: AuditResult[] = [];

  for (let i = 0; i < allToolNames.length; i += BATCH_SIZE) {
    const batch = allToolNames.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(name => auditTool(name, timeoutMs)));
    results.push(...batchResults);
  }

  const working = results.filter(r => r.status === 'WORKING');
  const disconnected = results.filter(r => r.status === 'DISCONNECTED');
  const broken = results.filter(r => r.status === 'BROKEN');

  const report: AuditReport = {
    total: results.length,
    working: working.length,
    disconnected: disconnected.length,
    broken: broken.length,
    results: results.sort((a, b) => {
      const order = { BROKEN: 0, DISCONNECTED: 1, WORKING: 2 };
      return order[a.status] - order[b.status];
    }),
    durationMs: Date.now() - reportStartTime,
  };

  return NextResponse.json(report);
}

export async function POST(request: NextRequest) {
  return GET(request);
}

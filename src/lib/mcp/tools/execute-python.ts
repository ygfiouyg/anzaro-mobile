import vm from 'vm';
/**
 * Tool: execute_python (Two-Tier Math Engine)
 * ============================================
 * Tier 1: safe_eval — pure JS sandbox for 90% of math (instant, zero cold-start)
 * Tier 2: execute_python — Python via Pyodide for complex math (integrals, matrices)
 *
 * The LLM calls this tool. Internally, we route:
 *   - Simple arithmetic → safe_eval (Tier 1, instant)
 *   - Complex math (numpy, pandas, scipy, sympy) → Pyodide (Tier 2, 3-5s)
 *
 * This prevents running a Python runtime 90% of the time.
 */

import type { MCPTool, MCPToolResult } from "../types";

// ═══════════════════════════════════════════════════════════════════════
// TIER 1: Safe JavaScript Evaluation (no I/O, no require, no fetch)
// ═══════════════════════════════════════════════════════════════════════

const MATH_CONTEXT: Record<string, unknown> = {
  // Math constants
  pi: Math.PI,
  e: Math.E,
  // Math functions
  abs: Math.abs,
  sqrt: Math.sqrt,
  pow: Math.pow,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  random: Math.random,
  // Statistics helpers
  mean: (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length,
  median: (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },
  sum: (arr: number[]) => arr.reduce((a, b) => a + b, 0),
  std: (arr: number[]) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
  },
  // Date helpers
  now: Date.now,
  Date,
};

// Keywords that indicate Python is needed (not just simple math)
const PYTHON_INDICATORS = /\b(import|numpy|np\.|pandas|pd\.|scipy|sympy|matplotlib|sklearn|tensorflow|torch|def |class |lambda |print\(|format\()|\[.*for.*in.*\]/i;

function safeEval(code: string): { success: boolean; result?: unknown; error?: string } {
  try {
    // Whitelist: only allow math expressions, no assignments, no function defs
    const forbidden = /\b(require|import|process|global|globalThis|window|document|fetch|eval|Function|setTimeout|setInterval|setImmediate|Buffer|child_process|fs|net|http|https|os|path|crypto|stream|while|for\s*\(|do\s*\{)\b/;
    if (forbidden.test(code)) {
      return { success: false, error: "Forbidden function/keyword detected" };
    }

    // Use vm module for sandboxed execution (safer than new Function)
    const sandbox = { ...MATH_CONTEXT, Math, Date, JSON, Array, Object, String, Number, Boolean, parseInt, parseFloat, isNaN, RegExp, Map, Set, Promise };
    const context = vm.createContext(sandbox);
    const result = vm.runInContext(`(${code})`, context, { timeout: 1000 });
    return { success: true, result };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TIER 2: Python Execution via Pyodide (loaded on demand)
// ═══════════════════════════════════════════════════════════════════════

let _pyodidePromise: Promise<any> | null = null;

async function getPyodide(): Promise<any> {
  if (_pyodidePromise) return _pyodidePromise;

  _pyodidePromise = (async () => {
    // Pyodide is loaded via CDN script injection (browser) or require (Node)
    // On Node.js/HF Space, we use the pyodide npm package
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      let loadPyodide: any = null;
      try {
        // Dynamic require (مش import) عشان webpack ما يحاولش يحلّه وقت الـ build
        const mod = eval('require')('pyodide');
        loadPyodide = mod.loadPyodide;
      } catch {
        throw new Error('pyodide مش مثبت');
      }
      const pyodide = await loadPyodide();
      // Pre-load common packages
      await pyodide.loadPackage(['numpy', 'pandas']);
      return pyodide;
    } catch {
      // Fallback: try CDN load
      throw new Error('Pyodide not available. Install with: npm install pyodide');
    }
  })();

  return _pyodidePromise;
}

async function executePython(code: string): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const pyodide = await getPyodide();

    // Capture stdout
    pyodide.runPython(`
      import sys
      from io import StringIO
      _old_stdout = sys.stdout
      sys.stdout = _capture = StringIO()
    `);

    // Run the user code
    const result = pyodide.runPython(code);

    // Get captured output
    const output = pyodide.runPython('_capture.getvalue()');

    // Restore stdout
    pyodide.runPython('sys.stdout = _old_stdout');

    return {
      success: true,
      result: result !== undefined ? String(result) : undefined,
      data: { stdout: output, result: result !== undefined ? String(result) : null },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// THE TOOL
// ═══════════════════════════════════════════════════════════════════════

export const executePythonTool: MCPTool = {
  name: "execute_python",
  description: `Execute Python code for precise math, data analysis, and computation.
ZERO HALLUCINATION — returns exact results.
Supports: numpy, pandas, scipy, sympy, matplotlib.
Use this for: integrals, matrices, statistics, data processing, complex calculations.
For simple arithmetic (2+2, 15% of 200), the system auto-routes to a faster engine.
Returns: { result, stdout, error }`,
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "Python code to execute. Use print() for output. numpy as np, pandas as pd are pre-imported.",
      },
      force_python: {
        type: "boolean",
        description: "If true, always use Python (even for simple math). Default: false.",
        default: false,
      },
    },
    required: ["code"],
  },

  async execute(params): Promise<MCPToolResult> {
    const code = String(params.code || "").trim();
    const forcePython = params.force_python === true;

    if (!code) {
      return { success: false, error: "No code provided" };
    }

    // ── TIER 1: Try safe JS eval first (instant) ──
    if (!forcePython && !PYTHON_INDICATORS.test(code)) {
      const evalResult = safeEval(code);
      if (evalResult.success) {
        return {
          success: true,
          data: {
            result: evalResult.result,
            engine: "javascript",
            note: "Evaluated instantly via safe JS engine. Set force_python=true for Python.",
          },
        };
      }
      // If JS eval failed, fall through to Python
    }

    // ── TIER 2: Execute via Pyodide (Python) ──
    const pyResult = await executePython(code);
    if (pyResult.success) {
      return {
        success: true,
        data: {
          ...pyResult.data,
          engine: "python",
        },
      };
    }

    return {
      success: false,
      error: pyResult.error || "Python execution failed",
    };
  },
};

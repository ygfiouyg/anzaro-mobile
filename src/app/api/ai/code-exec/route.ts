import { NextRequest, NextResponse } from 'next/server';
import vm from 'vm';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ─── Types ──────────────────────────────────────────────────────────────
interface CodeExecRequest {
  code: string;
  language: 'javascript' | 'typescript' | 'python' | 'html';
  input?: string;
}

interface CodeExecResponse {
  output: string;
  error: string | null;
  executionTime: number;
  language: string;
}

// ─── Security ───────────────────────────────────────────────────────────
const MAX_TIMEOUT = 5000; // 5 seconds
const MAX_OUTPUT_LENGTH = 5000;
const BLOCKED_PATTERNS = [
  /\brequire\s*\(/,
  /\bimport\s+/,
  /\bprocess\b/,
  /\bchild_process\b/,
  /\bfs\s*\./,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bmodule\b/,
  /\bexports\b/,
];

function isCodeSafe(code: string, language: string): string | null {
  if (language === 'html') return null; // HTML is just rendered as-is

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return `تم حظر الكود لأسباب أمنية: استخدام نمط محظور (${pattern.source})`;
    }
  }
  return null;
}

function truncateOutput(output: string): string {
  if (output.length > MAX_OUTPUT_LENGTH) {
    return output.slice(0, MAX_OUTPUT_LENGTH) + '\n\n[... تم اقتطاع المخرجات - الحد الأقصى 5000 حرف]';
  }
  return output;
}

// ─── JavaScript / TypeScript Execution ──────────────────────────────────
async function executeJavaScript(code: string, language: string, stdin?: string): Promise<CodeExecResponse> {
  const startTime = performance.now();

  try {
    const outputLines: string[] = [];

    // Create a sandboxed console
    const sandbox: Record<string, unknown> = {
      console: {
        log: (...args: unknown[]) => {
          outputLines.push(args.map(arg => formatValue(arg)).join(' '));
        },
        error: (...args: unknown[]) => {
          outputLines.push(args.map(arg => formatValue(arg)).join(' '));
        },
        warn: (...args: unknown[]) => {
          outputLines.push(args.map(arg => String(arg)).join(' '));
        },
        info: (...args: unknown[]) => {
          outputLines.push(args.map(arg => String(arg)).join(' '));
        },
        table: (...args: unknown[]) => {
          outputLines.push(args.map(arg => formatValue(arg)).join('\n'));
        },
      },
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Map,
      Set,
      RegExp,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      Promise,
      Symbol,
      undefined,
      NaN,
      Infinity,
      input: stdin || '',
      readline: () => stdin || '',
    };

    // For TypeScript, strip type annotations (simple approach)
    let executableCode = code;
    if (language === 'typescript') {
      executableCode = stripTypeScript(code);
    }

    // Wrap in async IIFE to support top-level await
    const wrappedCode = `(async () => { ${executableCode} })()`;

    const context = vm.createContext(sandbox);
    const script = new vm.Script(wrappedCode, {
      filename: language === 'typescript' ? 'sandbox.ts' : 'sandbox.js',
    });

    const result = script.runInContext(context, {
      timeout: MAX_TIMEOUT,
      breakOnSigint: true,
    });

    // Wait for async result if it's a Promise
    if (result && typeof result === 'object' && typeof (result as Promise<unknown>).then === 'function') {
      const asyncTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('انتهت مهلة التنفيذ (الحد الأقصى 5 ثوانٍ)')), Math.max(0, MAX_TIMEOUT - (performance.now() - startTime)));
      });

      const asyncResult = await Promise.race([result, asyncTimeout]);
      if (asyncResult !== undefined && asyncResult !== null) {
        outputLines.push(formatValue(asyncResult));
      }
    } else if (result !== undefined && result !== null) {
      outputLines.push(formatValue(result));
    }

    const executionTime = Math.round(performance.now() - startTime);
    const output = truncateOutput(outputLines.join('\n'));

    return {
      output: output || '(لا توجد مخرجات)',
      error: null,
      executionTime,
      language,
    };
  } catch (err) {
    const executionTime = Math.round(performance.now() - startTime);
    let errorMessage = 'حدث خطأ غير معروف';

    if (err instanceof Error) {
      if (err.message.includes('Script execution timed out')) {
        errorMessage = 'انتهت مهلة التنفيذ (الحد الأقصى 5 ثوانٍ)';
      } else {
        // Clean up error message
        errorMessage = err.message.replace(/^Error:\s*/, '');
      }
    }

    return {
      output: '',
      error: truncateOutput(errorMessage),
      executionTime,
      language,
    };
  }
}

function formatValue(val: unknown): string {
  if (typeof val === 'object' && val !== null) {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function stripTypeScript(code: string): string {
  return code
    // Remove type annotations after colons in declarations (variable: type)
    .replace(/:\s*(string|number|boolean|any|void|never|unknown|null|undefined|object)(\[\])?(\s*[=,;)\]])/g, '$3')
    // Remove generic type parameters
    .replace(/<[^>]+>/g, '')
    // Remove interface declarations
    .replace(/interface\s+\w+(\s+extends\s+\w+)?\s*\{[^}]*\}/g, '')
    // Remove type alias declarations
    .replace(/type\s+\w+(\s*<[^>]+>)?\s*=\s*[^;]+;/g, '')
    // Remove 'as' type assertions
    .replace(/as\s+(string|number|boolean|any|unknown)/g, '')
    // Remove non-null assertions
    .replace(/!\./g, '.')
    // Remove optional chaining (already valid JS, but just in case)
    .replace(/\?\./g, '.')
    // Remove enum declarations
    .replace(/enum\s+\w+\s*\{[^}]*\}/g, '')
    // Remove declare statements
    .replace(/declare\s+[^;]+;/g, '');
}

// ─── HTML Handling ──────────────────────────────────────────────────────
function handleHTML(code: string): CodeExecResponse {
  const startTime = performance.now();
  return {
    output: code,
    error: null,
    executionTime: Math.round(performance.now() - startTime),
    language: 'html',
  };
}

// ─── Python Handling ────────────────────────────────────────────────────
function handlePython(): CodeExecResponse {
  return {
    output: '',
    error: 'تشغيل بايثون يتطلب بيئة حاوية مخصصة. حالياً، يتم دعم JavaScript و TypeScript و HTML فقط.',
    executionTime: 0,
    language: 'python',
  };
}

// ─── POST Handler ───────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── FIX: Require authentication for code execution (RCE vulnerability) ──
    // Previously anyone could execute arbitrary code on the server
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    if (!user) {
      return NextResponse.json(
        { error: 'يجب تسجيل الدخول لتنفيذ الكود' },
        { status: 401 }
      );
    }

    // ── Rate limiting: 10 code executions per minute per user ──
    const rateLimitResponse = checkRateLimit(
      request,
      { ...RATE_LIMIT_PRESETS.ai, maxRequests: 10 },
      user.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body: CodeExecRequest = await request.json();
    const { code, language, input } = body;

    // Validate inputs
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'يرجى إدخال الكود المراد تنفيذه' },
        { status: 400 }
      );
    }

    if (code.length > 50000) {
      return NextResponse.json(
        { error: 'الكود طويل جداً. الحد الأقصى 50,000 حرف.' },
        { status: 400 }
      );
    }

    const supportedLanguages = ['javascript', 'typescript', 'python', 'html'];
    if (!language || !supportedLanguages.includes(language)) {
      return NextResponse.json(
        { error: `لغة غير مدعومة. اللغات المدعومة: ${supportedLanguages.join(', ')}` },
        { status: 400 }
      );
    }

    // Security check
    const securityError = isCodeSafe(code, language);
    if (securityError) {
      return NextResponse.json({
        output: '',
        error: securityError,
        executionTime: 0,
        language,
      } satisfies CodeExecResponse);
    }

    // Execute based on language
    let result: CodeExecResponse;

    switch (language) {
      case 'javascript':
      case 'typescript':
        result = await executeJavaScript(code, language, input);
        break;
      case 'html':
        result = handleHTML(code);
        break;
      case 'python':
        result = handlePython();
        break;
      default:
        result = {
          output: '',
          error: 'لغة غير مدعومة',
          executionTime: 0,
          language,
        };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[CodeExec] Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في الخادم أثناء تنفيذ الكود' },
      { status: 500 }
    );
  }
}

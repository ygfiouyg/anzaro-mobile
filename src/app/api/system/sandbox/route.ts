import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { recordApiResponseTime, recordError } from '@/lib/system-monitor';

// ─── Sandbox Test API ─────────────────────────────────────────────────
// Validates code structure and runs predefined safe operations.
// NEVER actually executes arbitrary code.

interface SandboxRequest {
  code: string;
  type: 'api' | 'component' | 'function';
}

interface SandboxResult {
  success: boolean;
  output: string;
  error: string | null;
  duration: number;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}

// ─── API Route Validation ─────────────────────────────────────────────

function validateApiRoute(code: string): { checks: Array<{ name: string; passed: boolean; detail: string }>; output: string } {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  // Check 1: Exports a route handler (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
  const hasHandler = /\bexport\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/.test(code);
  checks.push({
    name: 'Route Handler Export',
    passed: hasHandler,
    detail: hasHandler
      ? 'Found exported route handler function'
      : 'Missing exported route handler (GET, POST, PUT, DELETE, etc.)',
  });

  // Check 2: Uses NextRequest/Request parameter
  const usesRequest = /NextRequest|Request/.test(code);
  checks.push({
    name: 'Request Parameter',
    passed: usesRequest,
    detail: usesRequest
      ? 'Uses NextRequest or Request parameter'
      : 'Route handler should accept a Request parameter',
  });

  // Check 3: Returns NextResponse/Response
  const returnsResponse = /NextResponse|new\s+Response/.test(code);
  checks.push({
    name: 'Response Return',
    passed: returnsResponse,
    detail: returnsResponse
      ? 'Returns NextResponse or Response'
      : 'Should return NextResponse or Response object',
  });

  // Check 4: Has error handling
  const hasErrorHandling = /try\s*\{|catch\s*\(/.test(code);
  checks.push({
    name: 'Error Handling',
    passed: hasErrorHandling,
    detail: hasErrorHandling
      ? 'Has try/catch error handling'
      : 'Should include error handling with try/catch',
  });

  // Check 5: No dangerous operations
  const hasDangerousOps = /eval\s*\(|Function\s*\(|child_process|fs\.(unlink|rmdir|writeFileSync)/.test(code);
  checks.push({
    name: 'Security Check',
    passed: !hasDangerousOps,
    detail: hasDangerousOps
      ? 'Contains potentially dangerous operations (eval, Function constructor, fs writes)'
      : 'No dangerous operations detected',
  });

  // Check 6: Uses proper imports
  const hasImports = /import\s+/.test(code);
  checks.push({
    name: 'Import Statements',
    passed: hasImports,
    detail: hasImports
      ? 'Has import statements'
      : 'Should include necessary imports (NextRequest, NextResponse, etc.)',
  });

  const allPassed = checks.every((c) => c.passed);
  const output = allPassed
    ? 'API route structure is valid and follows best practices.'
    : `API route has ${checks.filter((c) => !c.passed).length} issue(s) that should be addressed.`;

  return { checks, output };
}

// ─── Component Validation ─────────────────────────────────────────────

function validateComponent(code: string): { checks: Array<{ name: string; passed: boolean; detail: string }>; output: string } {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  // Check 1: Has React component pattern
  const isComponent = /function\s+[A-Z]\w*\s*\(|const\s+\w+\s*=\s*(\(\s*\)|\w+)\s*=>\s*|export\s+default\s+function/.test(code);
  checks.push({
    name: 'Component Definition',
    passed: isComponent,
    detail: isComponent
      ? 'Found React component definition'
      : 'Missing React component (should be a function starting with uppercase)',
  });

  // Check 2: Returns JSX
  const returnsJsx = /return\s*\(?\s*<|return\s+\w+\s*\.\s*createElement/.test(code);
  checks.push({
    name: 'JSX Return',
    passed: returnsJsx,
    detail: returnsJsx
      ? 'Component returns JSX'
      : 'Component should return JSX elements',
  });

  // Check 3: Has 'use client' or 'use server' directive if needed
  const hasDirective = /['"]use\s+(client|server)['"]/.test(code);
  const usesHooks = /useState|useEffect|useCallback|useMemo|useRef/.test(code);
  const needsClientDirective = usesHooks && !hasDirective;
  checks.push({
    name: 'Client/Server Directive',
    passed: !needsClientDirective,
    detail: needsClientDirective
      ? 'Uses React hooks but missing "use client" directive'
      : hasDirective
        ? 'Has client/server directive'
        : 'No directive needed (server component)',
  });

  // Check 4: Proper TypeScript types
  const hasTypes = /:\s*(string|number|boolean|void|React\.)|interface\s+\w+|type\s+\w+\s*=/.test(code);
  checks.push({
    name: 'TypeScript Types',
    passed: hasTypes,
    detail: hasTypes
      ? 'Uses TypeScript type annotations'
      : 'Should include TypeScript type annotations',
  });

  // Check 5: No inline styles with dangerous content
  const hasDangerousStyles = /dangerouslySetInnerHTML/.test(code);
  checks.push({
    name: 'Security Check',
    passed: !hasDangerousStyles,
    detail: hasDangerousStyles
      ? 'Uses dangerouslySetInnerHTML - ensure content is sanitized'
      : 'No dangerous HTML injection patterns',
  });

  // Check 6: Uses proper imports
  const hasReactImport = /import.*React|import.*from\s+['"]react['"]|from\s+['"]next/.test(code);
  checks.push({
    name: 'React/Next Imports',
    passed: hasReactImport,
    detail: hasReactImport
      ? 'Has React or Next.js imports'
      : 'Should import React or Next.js modules',
  });

  const allPassed = checks.every((c) => c.passed);
  const output = allPassed
    ? 'Component structure is valid and follows React best practices.'
    : `Component has ${checks.filter((c) => !c.passed).length} issue(s) that should be addressed.`;

  return { checks, output };
}

// ─── Function Validation ──────────────────────────────────────────────

function validateFunction(code: string): { checks: Array<{ name: string; passed: boolean; detail: string }>; output: string } {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  // Check 1: Has function definition
  const hasFunction = /function\s+\w+\s*\(|const\s+\w+\s*=\s*(\([^)]*\)|\w+)\s*=>|export\s+(async\s+)?function/.test(code);
  checks.push({
    name: 'Function Definition',
    passed: hasFunction,
    detail: hasFunction
      ? 'Found function definition'
      : 'Missing function definition',
  });

  // Check 2: Has TypeScript types
  const hasParamTypes = /\(\s*\w+\s*:|:\s*(string|number|boolean|void|Promise|Array|Record)/.test(code);
  checks.push({
    name: 'TypeScript Types',
    passed: hasParamTypes,
    detail: hasParamTypes
      ? 'Function has TypeScript type annotations'
      : 'Should add TypeScript type annotations to parameters and return type',
  });

  // Check 3: Has error handling
  const hasErrorHandling = /try\s*\{|catch\s*\(|throw\s+new/.test(code);
  checks.push({
    name: 'Error Handling',
    passed: hasErrorHandling,
    detail: hasErrorHandling
      ? 'Has error handling (try/catch or throw)'
      : 'Should include error handling',
  });

  // Check 4: No side effects in function body
  const hasSideEffects = /localStorage|sessionStorage|document\.\w+|window\.\w+/.test(code);
  checks.push({
    name: 'Pure Function Check',
    passed: !hasSideEffects,
    detail: hasSideEffects
      ? 'Function has side effects (DOM/localStorage access) - consider making it pure'
      : 'Function appears to be side-effect free',
  });

  // Check 5: Has return statement
  const hasReturn = /\breturn\b/.test(code);
  checks.push({
    name: 'Return Statement',
    passed: hasReturn,
    detail: hasReturn
      ? 'Function has return statement'
      : 'Should include a return statement',
  });

  // Check 6: No dangerous operations
  const hasDangerousOps = /eval\s*\(|Function\s*\(|process\.exit|require\s*\(\s*['"]child_process/.test(code);
  checks.push({
    name: 'Security Check',
    passed: !hasDangerousOps,
    detail: hasDangerousOps
      ? 'Contains dangerous operations (eval, Function, process.exit)'
      : 'No dangerous operations detected',
  });

  // Safe test - identify function name
  let testOutput = '';
  try {
    const simpleFnMatch = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+))\s*[=(]/);
    if (simpleFnMatch) {
      const fnName = simpleFnMatch[1] || simpleFnMatch[2];
      testOutput = `Function "${fnName}" detected. Structure validated successfully.`;
    } else {
      testOutput = 'Code structure validated.';
    }
  } catch {
    testOutput = 'Could not parse function name for testing.';
  }

  const allPassed = checks.every((c) => c.passed);
  const output = allPassed
    ? `Function is valid. ${testOutput}`
    : `Function has ${checks.filter((c) => !c.passed).length} issue(s) that should be addressed. ${testOutput}`;

  return { checks, output };
}

// ─── POST Handler ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const requestStart = Date.now();

  try {
    // Auth check
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;

    if (!user) {
      return NextResponse.json(
        { error: 'يرجى تسجيل الدخول لاستخدام Sandbox' },
        { status: 401 }
      );
    }

    const body = await request.json() as SandboxRequest;
    const { code, type } = body;

    // Validate inputs
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'الكود مطلوب ويجب أن يكون نصاً' },
        { status: 400 }
      );
    }

    if (!['api', 'component', 'function'].includes(type)) {
      return NextResponse.json(
        { error: 'النوع يجب أن يكون api أو component أو function' },
        { status: 400 }
      );
    }

    // Code length limit - 50KB max
    if (code.length > 50 * 1024) {
      return NextResponse.json(
        { error: 'الكود طويل جداً. الحد الأقصى 50 كيلوبايت' },
        { status: 400 }
      );
    }

    // Simulate 30-second timeout constraint (actual validation is fast)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Sandbox timeout: validation took too long')), 30_000);
    });

    // Validate code based on type
    const validationPromise = new Promise<{ checks: Array<{ name: string; passed: boolean; detail: string }>; output: string }>((resolve) => {
      switch (type) {
        case 'api':
          resolve(validateApiRoute(code));
          break;
        case 'component':
          resolve(validateComponent(code));
          break;
        case 'function':
          resolve(validateFunction(code));
          break;
        default:
          resolve({ checks: [], output: 'Unknown type' });
      }
    });

    const validation = await Promise.race([validationPromise, timeoutPromise]);

    const duration = Date.now() - requestStart;
    recordApiResponseTime('/api/system/sandbox', duration);

    const result: SandboxResult = {
      success: validation.checks.every((c) => c.passed),
      output: validation.output,
      error: null,
      duration,
      checks: validation.checks,
    };

    return NextResponse.json(result);
  } catch (error) {
    const duration = Date.now() - requestStart;
    recordError('/api/system/sandbox', error instanceof Error ? error.message : 'Unknown error');
    recordApiResponseTime('/api/system/sandbox', duration);

    return NextResponse.json(
      {
        success: false,
        output: '',
        error: 'حدث خطأ غير متوقع',
        duration,
        checks: [],
      } satisfies SandboxResult,
      { status: 500 }
    );
  }
}

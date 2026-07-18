'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Pyodide WASM Python Loader ─────────────────────────────────────────
// Lazy-loads Pyodide only when Python is first executed.
// Cached in module scope so it's only loaded once per session.
let pyodideInstance: any = null;
let pyodideLoadingPromise: Promise<any> | null = null;

async function loadPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoadingPromise) return pyodideLoadingPromise;

  pyodideLoadingPromise = (async () => {
    // Load the Pyodide script from CDN
    await new Promise<void>((resolve, reject) => {
      if ((window as any).loadPyodide) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide from CDN'));
      document.head.appendChild(script);
    });

    pyodideInstance = await (window as any).loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
    });

    return pyodideInstance;
  })();

  return pyodideLoadingPromise;
}

async function executePython(code: string): Promise<{ output: string; error: string | null }> {
  try {
    const pyodide = await loadPyodide();

    let output = '';
    let error: string | null = null;

    // Capture stdout/stderr
    pyodide.setStdout({ batched: (text: string) => { output += text + '\n'; } });
    pyodide.setStderr({ batched: (text: string) => { output += text + '\n'; } });

    try {
      await pyodide.runPythonAsync(code);
    } catch (e: any) {
      error = e.message || String(e);
    }

    return { output: output.trim(), error };
  } catch (e: any) {
    return { output: '', error: `فشل تحميل Pyodide: ${e.message || 'خطأ غير معروف'}` };
  }
}

import {
  Code2,
  Play,
  Copy,
  Check,
  Trash2,
  Loader2,
  Terminal,
  Clock,
  AlertCircle,
  X,
  RotateCcw,
  FileCode,
  MonitorSmartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────
interface CodeSandboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCode?: string;
  initialLanguage?: string;
}

type Language = 'javascript' | 'typescript' | 'python' | 'html';

interface ExecResult {
  output: string;
  error: string | null;
  executionTime: number;
  language: string;
}

// ─── Sample Code Templates ──────────────────────────────────────────────
const SAMPLE_CODE: Record<Language, string> = {
  javascript: `// مثال: حساب متتالية فيبوناتشي
function fibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

for (let i = 0; i < 10; i++) {
  console.log(\`فيبوناتشي(\${i}) = \${fibonacci(i)}\`);
}`,
  typescript: `// مثال: فرز مصفوفة باستخدام التريبوناتشي
function bubbleSort(arr: number[]): number[] {
  const sorted = [...arr];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = 0; j < sorted.length - i - 1; j++) {
      if (sorted[j] > sorted[j + 1]) {
        [sorted[j], sorted[j + 1]] = [sorted[j + 1], sorted[j]];
      }
    }
  }
  return sorted;
}

const numbers = [64, 34, 25, 12, 22, 11, 90];
console.log("قبل الفرز:", numbers);
console.log("بعد الفرز:", bubbleSort(numbers));`,
  python: `# مثال: بايثون - يعمل عبر Pyodide WASM في المتصفح
# Python runs via Pyodide WASM (client-side, no server needed)

def greet(name):
    return f"مرحباً، {name}!"

print(greet("العالم"))

# تجربة الحسابات
numbers = [64, 34, 25, 12, 22, 11, 90]
numbers.sort()
print("بعد الفرز:", numbers)`,
  html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>مثال HTML</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .card {
      background: rgb(59, 130, 246);
      backdrop-filter: blur(10px);
      padding: 2rem;
      border-radius: 16px;
      text-align: center;
      border: 1px solid rgb(219, 234, 254);
    }
    h1 { margin: 0 0 0.5rem; font-size: 2rem; }
    p { margin: 0; opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <h1>مرحباً بالعالم! 🌍</h1>
    <p>صندوق الأكواد - Anzaro AI</p>
  </div>
</body>
</html>`,
};

const LANGUAGES: { value: Language; label: string; icon: string }[] = [
  { value: 'javascript', label: 'JavaScript', icon: '🟨' },
  { value: 'typescript', label: 'TypeScript', icon: '🔷' },
  { value: 'python', label: 'Python', icon: '🐍' },
  { value: 'html', label: 'HTML', icon: '🌐' },
];

// ─── Component ──────────────────────────────────────────────────────────
export function CodeSandbox({ open, onOpenChange, initialCode, initialLanguage }: CodeSandboxProps) {
  const [language, setLanguage] = useState<Language>(initialLanguage as Language || 'javascript');
  const [code, setCode] = useState(initialCode || SAMPLE_CODE.javascript);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [mobileTab, setMobileTab] = useState<'code' | 'output'>('code');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Sync with initial props when dialog opens
  useEffect(() => {
    if (open) {
      if (initialLanguage && initialLanguage !== language) {
        setLanguage(initialLanguage as Language);
      }
      if (initialCode && initialCode !== code) {
        setCode(initialCode);
      } else if (!initialCode) {
        setCode(SAMPLE_CODE[language]);
      }
      setMobileTab('code');
    }
  }, [open]); // Only re-run when dialog opens

  // Handle language change
  const handleLanguageChange = useCallback((newLang: Language) => {
    setLanguage(newLang);
    setCode(SAMPLE_CODE[newLang]);
    setOutput('');
    setError(null);
    setExecutionTime(null);
  }, []);

  // Run code
  const handleRun = useCallback(async () => {
    if (!code.trim()) {
      toast.error('يرجى إدخال الكود أولاً');
      return;
    }

    setIsRunning(true);
    setOutput('');
    setError(null);
    setExecutionTime(null);
    setMobileTab('output');

    try {
      // ── Python: run via Pyodide WASM (client-side, no server needed) ──
      if (language === 'python') {
        const result = await executePython(code);
        setOutput(result.output || '(لا يوجد مخرجات)');
        setError(result.error);
        setExecutionTime(0);

        if (result.error) {
          toast.error('يوجد خطأ في كود بايثون');
        } else {
          toast.success('تم تنفيذ كود بايثون بنجاح 🐍');
        }
        return;
      }

      // ── JavaScript/TypeScript/HTML: run via server API ──
      const response = await fetch('/api/ai/code-exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });

      const data: ExecResult = await response.json();

      if (!response.ok) {
        // Enhanced Python error message
        if (language === 'python') {
          setError(
            (data.error || 'بيئة بايثون غير متوفرة') +
            '\n\n💡 نصيحة: جرّب تحويل الكود إلى JavaScript أو TypeScript - يدعم نفس الوظائف المنطقية.'
          );
        } else {
          setError(data.error || 'حدث خطأ غير معروف');
        }
        toast.error('فشل في تنفيذ الكود');
        return;
      }

      setOutput(data.output);
      setError(data.error);
      setExecutionTime(data.executionTime);

      // Enhanced Python error with helpful suggestion
      if (data.error && language === 'python') {
        setError(
          data.error +
          '\n\n💡 نصيحة: جرّب تحويل الكود إلى JavaScript أو TypeScript - يدعم نفس الوظائف المنطقية.'
        );
      }

      if (data.error) {
        toast.error('يوجد خطأ في الكود');
      } else {
        toast.success('تم تنفيذ الكود بنجاح');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'حدث خطأ في الاتصال بالخادم';
      if (language === 'python') {
        setError(
          errMsg +
          '\n\n💡 نصيحة: بيئة بايثون غير متوفرة حالياً. جرّب JavaScript أو TypeScript كبديل.'
        );
      } else {
        setError(errMsg);
      }
      toast.error('فشل في الاتصال بالخادم');
    } finally {
      setIsRunning(false);
    }
  }, [code, language]);

  // Copy code
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('تم نسخ الكود!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('فشل في النسخ');
    }
  }, [code]);

  // Copy output
  const handleCopyOutput = useCallback(async () => {
    if (!output && !error) return;
    const textToCopy = error ? `${output ? output + '\n---\n' : ''}Error: ${error}` : output;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedOutput(true);
      toast.success('تم نسخ المخرجات!');
      setTimeout(() => setCopiedOutput(false), 2000);
    } catch {
      toast.error('فشل في نسخ المخرجات');
    }
  }, [output, error]);

  // Clear code and output
  const handleClear = useCallback(() => {
    setCode('');
    setOutput('');
    setError(null);
    setExecutionTime(null);
    textareaRef.current?.focus();
  }, []);

  // Reset to sample code
  const handleResetToSample = useCallback(() => {
    setCode(SAMPLE_CODE[language]);
    setOutput('');
    setError(null);
    setExecutionTime(null);
    textareaRef.current?.focus();
    toast.success('تم استعادة الكود التجريبي');
  }, [language]);

  // Sync line numbers with textarea scroll
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Keyboard handler with Tab, shortcuts, auto-close brackets, auto-indent
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab key → insert 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textareaRef.current?.selectionStart || 0;
      const end = textareaRef.current?.selectionEnd || 0;

      if (start !== end) {
        // Indent selected lines
        const beforeSelection = code.substring(0, start);
        const selectedText = code.substring(start, end);
        const afterSelection = code.substring(end);
        const indentedText = selectedText
          .split('\n')
          .map((line) => '  ' + line)
          .join('\n');
        const newValue = beforeSelection + indentedText + afterSelection;
        setCode(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = start;
            textareaRef.current.selectionEnd = start + indentedText.length;
          }
        }, 0);
      } else {
        const newValue = code.substring(0, start) + '  ' + code.substring(end);
        setCode(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
          }
        }, 0);
      }
      return;
    }

    // Ctrl+Enter → Run
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleRun();
      return;
    }

    // Ctrl+S → Prevent default browser save
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      toast.success('الكود محفوظ تلقائياً');
      return;
    }

    // Auto-close brackets
    const pairs: Record<string, string> = {
      '{': '}',
      '(': ')',
      '[': ']',
      '"': '"',
      "'": "'",
      '`': '`',
    };

    if (pairs[e.key]) {
      const start = textareaRef.current?.selectionStart || 0;
      const end = textareaRef.current?.selectionEnd || 0;
      const selectedText = code.substring(start, end);

      if (selectedText.length > 0) {
        // Wrap selection with brackets
        e.preventDefault();
        const newValue = code.substring(0, start) + e.key + selectedText + pairs[e.key] + code.substring(end);
        setCode(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = start + 1;
            textareaRef.current.selectionEnd = end + 1;
          }
        }, 0);
      } else {
        // Insert pair and place cursor between them
        e.preventDefault();
        const newValue = code.substring(0, start) + e.key + pairs[e.key] + code.substring(end);
        setCode(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
          }
        }, 0);
      }
      return;
    }

    // Backspace → delete matching pair
    if (e.key === 'Backspace') {
      const start = textareaRef.current?.selectionStart || 0;
      if (start > 0 && start === (textareaRef.current?.selectionEnd || 0)) {
        const charBefore = code[start - 1];
        const charAfter = code[start];
        const closingPairs: Record<string, string> = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'", '`': '`' };
        if (closingPairs[charBefore] === charAfter) {
          e.preventDefault();
          const newValue = code.substring(0, start - 1) + code.substring(start + 1);
          setCode(newValue);
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start - 1;
            }
          }, 0);
          return;
        }
      }
    }

    // Enter → auto-indent
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      const start = textareaRef.current?.selectionStart || 0;
      const lineStart = code.lastIndexOf('\n', start - 1) + 1;
      const currentLine = code.substring(lineStart, start);
      const indent = currentLine.match(/^\s*/)?.[0] || '';
      const lastChar = code[start - 1];
      // Add extra indent after { or :
      const extraIndent = lastChar === '{' || lastChar === ':' ? '  ' : '';
      e.preventDefault();
      const newValue = code.substring(0, start) + '\n' + indent + extraIndent + code.substring(start);
      setCode(newValue);
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = start + 1 + indent.length + extraIndent.length;
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newPos;
        }
      }, 0);
      return;
    }
  }, [code, handleRun]);

  // Calculate line count
  const lineCount = code.split('\n').length;

  // Handle close
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // ─── Code Editor Panel (shared between desktop and mobile) ──────────
  const codeEditorPanel = (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Editor Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 dark:bg-zinc-800 border-b border-zinc-800 dark:border-zinc-700 flex-wrap">
        <motion.button
          onClick={handleRun}
          disabled={isRunning || !code.trim()}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
            !isRunning && code.trim()
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
              : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
          )}
          whileHover={!isRunning && code.trim() ? { scale: 1.05 } : {}}
          whileTap={!isRunning && code.trim() ? { scale: 0.95 } : {}}
          aria-label="تشغيل الكود"
        >
          {isRunning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          <span>{isRunning ? 'جاري التشغيل...' : 'تشغيل'}</span>
        </motion.button>

        <motion.button
          onClick={handleCopy}
          disabled={!code.trim()}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all',
            code.trim()
              ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          )}
          whileHover={code.trim() ? { scale: 1.05 } : {}}
          whileTap={code.trim() ? { scale: 0.95 } : {}}
          aria-label="نسخ الكود"
        >
          {copied ? (
            <Check className="size-3.5 text-blue-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
          <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
        </motion.button>

        <motion.button
          onClick={handleResetToSample}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-all"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="استعادة الكود التجريبي"
        >
          <RotateCcw className="size-3.5" />
          <span>استعادة</span>
        </motion.button>

        <motion.button
          onClick={handleClear}
          disabled={!code.trim() && !output && !error}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all',
            code.trim() || output || error
              ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          )}
          whileHover={code.trim() || output || error ? { scale: 1.05 } : {}}
          whileTap={code.trim() || output || error ? { scale: 0.95 } : {}}
          aria-label="مسح الكل"
        >
          <Trash2 className="size-3.5" />
          <span>مسح</span>
        </motion.button>

        {/* Language Badge */}
        <div className="mr-auto flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500 font-mono">
            {LANGUAGES.find(l => l.value === language)?.icon} {language.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Code Editor Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Line Numbers */}
        <div
          ref={lineNumbersRef}
          className="flex-shrink-0 w-10 bg-zinc-950 dark:bg-zinc-900 border-l border-zinc-800 dark:border-zinc-700 overflow-hidden select-none pointer-events-none"
        >
          <div className="py-3">
            {Array.from({ length: lineCount }, (_, i) => (
              <div
                key={i}
                className="px-2 text-right text-[11px] leading-5 font-mono text-zinc-600"
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          placeholder={language === 'html' ? 'اكتب كود HTML هنا...' : `اكتب كود ${language} هنا...`}
          className={cn(
            'flex-1 resize-none bg-zinc-950 dark:bg-zinc-900 outline-none text-zinc-200 text-sm leading-5 font-mono p-3 min-h-0',
            'placeholder:text-zinc-600',
            'scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent'
          )}
          dir="ltr"
          spellCheck={false}
          autoFocus={open}
        />
      </div>
    </div>
  );

  // ─── Output Panel (shared between desktop and mobile) ──────────────
  const outputPanel = (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Output Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 dark:bg-zinc-800 border-b border-zinc-800 dark:border-zinc-700">
        <Terminal className="size-3.5 text-blue-400" />
        <span className="text-xs font-semibold text-zinc-300">المخرجات</span>

        {/* Copy Output Button */}
        {(output || error) && (
          <motion.button
            onClick={handleCopyOutput}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-zinc-200 transition-all mr-auto"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="نسخ المخرجات"
          >
            {copiedOutput ? (
              <Check className="size-3 text-blue-400" />
            ) : (
              <Copy className="size-3" />
            )}
            <span>{copiedOutput ? 'تم النسخ' : 'نسخ المخرجات'}</span>
          </motion.button>
        )}

        {executionTime !== null && !(output || error) && (
          <div className="mr-auto flex items-center gap-1 text-[10px] text-zinc-500">
            <Clock className="size-3" />
            <span>{executionTime} مللي ثانية</span>
          </div>
        )}
        {executionTime !== null && (output || error) && (
          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
            <Clock className="size-3" />
            <span>{executionTime} مللي ثانية</span>
          </div>
        )}
      </div>

      {/* Output Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {language === 'html' && output && !error ? (
          /* HTML iframe renderer */
          <iframe
            srcDoc={output}
            className="w-full h-full min-h-[200px] bg-background"
            sandbox="allow-scripts"
            title="معاينة HTML"
          />
        ) : (
          <div className="p-3 font-mono text-sm leading-5" dir="ltr">
            <AnimatePresence mode="wait">
              {isRunning ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-zinc-400"
                >
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-xs">جاري تنفيذ الكود...</span>
                </motion.div>
              ) : error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="size-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-400 text-xs font-semibold mb-1">خطأ في التنفيذ</p>
                      <pre className="text-red-300 text-xs whitespace-pre-wrap break-words">
                        {error}
                      </pre>
                    </div>
                  </div>
                  {output && (
                    <pre className="text-zinc-300 text-xs whitespace-pre-wrap mt-3 pt-3 border-t border-zinc-800">
                      {output}
                    </pre>
                  )}
                </motion.div>
              ) : output ? (
                <motion.div
                  key="output"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <pre className="text-blue-300 text-xs whitespace-pre-wrap break-words">
                    {output}
                  </pre>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12 text-zinc-600"
                >
                  <Terminal className="size-8 mb-2" />
                  <p className="text-xs">اضغط "تشغيل" لرؤية النتائج</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
        dir="rtl"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-zinc-950 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-8 rounded-lg bg-blue-600">
              <Code2 className="size-4 text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-zinc-100">
                صندوق الأكواد
              </DialogTitle>
              <DialogDescription className="text-[11px] text-zinc-400">
                اكتب وشغّل الكود مباشرة مع رؤية النتائج فوراً
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <Select value={language} onValueChange={(val) => handleLanguageChange(val as Language)}>
              <SelectTrigger className="h-8 w-36 bg-zinc-800 border-zinc-700 text-zinc-200 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    <span className="flex items-center gap-2">
                      <span>{lang.icon}</span>
                      <span>{lang.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="size-8 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              aria-label="إغلاق"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Main Content - Desktop: side-by-side, Mobile: tabbed */}
        {/* Desktop Layout */}
        <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
          {/* Code Editor Panel */}
          <div className="flex-1 flex flex-col min-h-0 border-l border-border bg-zinc-950 dark:bg-zinc-900">
            {codeEditorPanel}
          </div>

          {/* Output Panel */}
          <div className="flex-1 flex flex-col min-h-0 bg-zinc-950 dark:bg-zinc-900">
            {outputPanel}
          </div>
        </div>

        {/* Mobile Layout - Tabbed */}
        <div className="flex md:hidden flex-1 flex-col min-h-0 overflow-hidden">
          {/* Mobile Tab Switcher */}
          <div className="flex items-center bg-zinc-900 dark:bg-zinc-800 border-b border-zinc-800 dark:border-zinc-700">
            <button
              onClick={() => setMobileTab('code')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-all',
                mobileTab === 'code'
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-zinc-950'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <FileCode className="size-3.5" />
              <span>الكود</span>
            </button>
            <button
              onClick={() => setMobileTab('output')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-all relative',
                mobileTab === 'output'
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-zinc-950'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <MonitorSmartphone className="size-3.5" />
              <span>المخرجات</span>
              {/* Notification dot when output is available */}
              {(output || error) && mobileTab !== 'output' && (
                <span className="absolute top-2 left-[calc(50%-24px)] size-2 rounded-full bg-blue-500" />
              )}
            </button>
          </div>

          {/* Mobile Content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-zinc-950 dark:bg-zinc-900">
            {mobileTab === 'code' ? codeEditorPanel : outputPanel}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 dark:bg-zinc-800 border-t border-zinc-800 dark:border-zinc-700">
          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span>الحد الأقصى: 5 ثوانٍ</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">مخرجات: 5000 حرف</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline font-mono">
              Ctrl+Enter: تشغيل | Tab: مسافة
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile shortcuts hint */}
            <span className="sm:hidden text-[10px] text-zinc-600 font-mono">
              ⌘↵ تشغيل
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {code.length.toLocaleString()} حرف
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

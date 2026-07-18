'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  language?: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for clipboard failure
    }
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border bg-zinc-950 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 dark:bg-zinc-800 border-b border-border">
        <span className="text-xs text-zinc-400 font-mono">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
            'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200',
            'min-h-[28px] min-w-[28px]'
          )}
          aria-label={copied ? 'تم النسخ' : 'نسخ الكود'}
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-blue-400" />
              <span className="text-blue-400">تم النسخ</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>نسخ</span>
            </>
          )}
        </button>
      </div>
      {/* Code content */}
      <div className="overflow-x-auto">
        <pre className="p-4 text-sm leading-relaxed">
          <code className="text-zinc-200 font-mono whitespace-pre">
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}

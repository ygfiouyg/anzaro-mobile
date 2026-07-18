'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal, Send, Brain, Square, Loader2, Shield,
  FileCode, Code2, Bug, Zap, ArrowLeft, Cpu, Package, Globe, GitCommit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth-store';
import { Message } from './message';
import { cn } from '@/lib/utils';
import type { ChatMessage, SSEEvent } from './types';

/**
 * AdminAgentChat — شات الـ Admin Agent (القوة الكاملة).
 *
 * بيستخدم /api/admin/agent (المحمي بـ requireAdmin) عشان يـ stream
 * الردود + tool calls من GLM.
 *
 * الأدوات المتاحة (12 أداة):
 * - list_files, read_file, write_file, modify_file, delete_file
 * - search_code, run_lint, analyze_structure
 * - run_command, install_package, fetch_url, git_commit_push
 */
export function AdminAgentChat() {
  const { token } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [text]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSSEEvent = useCallback((event: SSEEvent, assistantId: string) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== assistantId) return m;
      switch (event.type) {
        case 'token':
          return { ...m, content: m.content + event.content };
        case 'thinking':
          return { ...m, thinking: (m.thinking ?? '') + event.content };
        case 'tool_start': {
          const tc = {
            id: event.tool_call_id ?? `tc-${Date.now()}-${Math.random()}`,
            tool: event.tool,
            args: event.args,
            status: 'running' as const,
          };
          return { ...m, toolCalls: [...(m.toolCalls ?? []), tc] };
        }
        case 'tool_end': {
          const toolCalls = (m.toolCalls ?? []).map((tc) =>
            tc.tool === event.tool && tc.status === 'running'
              ? { ...tc, result: event.result, status: 'success' as const }
              : tc
          );
          return { ...m, toolCalls };
        }
        case 'skills_loaded':
          return { ...m, loadedSkills: event.skills };
        case 'done':
          return { ...m, streaming: false };
        case 'error':
          return { ...m, content: m.content + `\n\n❌ **خطأ:** ${event.error}`, streaming: false };
        default:
          return m;
      }
    }));
  }, []);

  const handleSend = useCallback(async (promptText?: string) => {
    const content = (promptText ?? text).trim();
    if (!content || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      thinking: '',
      timestamp: Date.now(),
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/admin/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content }].map((m) => ({ role: m.role, content: m.content })),
          enableThinking: thinking,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            handleSSEEvent(event, assistantId);
          } catch {}
        }
      }
    } catch (e: unknown) {
      if (e.name !== 'AbortError') {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `❌ خطأ: ${e instanceof Error ? e.message : String(e)}`, streaming: false } : m));
      }
    } finally {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m));
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [text, isStreaming, messages, thinking, token, handleSSEEvent]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const adminExamples = [
    { tag: 'تحليل', prompt: 'حلل هيكل المنصة بالكامل واعرضلي ملخص عن التقنيات والملفات', icon: '🔍' },
    { tag: 'تثبيت package', prompt: 'ثبّت package اسمه axios واعرضلي إزاي أستخدمه', icon: '📦' },
    { tag: 'تنزيل من GitHub', prompt: 'نزّل الكود من https://raw.githubusercontent.com/user/repo/main/README.md واعرضلي محتواه', icon: '🌐' },
    { tag: 'ميزة + حفظ', prompt: 'ضيف API route على /api/health بيرجع حالة المنصة، وبعدين اعمل git commit و push', icon: '✨' },
    { tag: 'إصلاح', prompt: 'شغل lint على المشروع واعرضلي الأخطاء لو فيه، وصلحها', icon: '🐛' },
    { tag: 'أمر shell', prompt: 'شغّل أمر git status واعرضلي حالة الـ repo', icon: '⚡' },
  ];

  // أمثلة تسويقية بتختبر الـ skills
  const marketingExamples = [
    { tag: '🎯 CRO', prompt: 'عاوز أحسن conversion rate بتاع landing page بتاعتي اللي بتبيع SaaS tool. إيه النصايح؟', icon: '🎯' },
    { tag: '✍️ Copywriting', prompt: 'اكتبلي ad copy احترافي لمنتج SaaS بيحل مشكلة إدارة المشاريع للفرق البعيدة', icon: '✍️' },
    { tag: '🔍 SEO', prompt: 'إزاي أحسن SEO لموقعي؟ اعرضلي خطة شاملة', icon: '🔍' },
    { tag: '💰 Pricing', prompt: 'ببيع منتجي بـ $20/شهر. إيه أحسن استراتيجية pricing وأعمل tiers إزاي؟', icon: '💰' },
  ];

  const adminFeatures = [
    { icon: FileCode, title: 'قراءة الملفات', desc: 'اقرأ أي ملف في المشروع' },
    { icon: Code2, title: 'تعديل الكود', desc: 'أصلح الأخطاء وعدّل الملفات' },
    { icon: Package, title: 'تثبيت Packages', desc: 'ثبّت أي مكتبة من npm' },
    { icon: Globe, title: 'تنزيل من URLs', desc: 'نزّل كود من GitHub أو أي URL' },
    { icon: Terminal, title: 'تشغيل أوامر', desc: 'أي أمر shell — build, git, etc.' },
    { icon: GitCommit, title: 'حفظ في Git', desc: 'commit + push للتعديلات' },
  ];

  return (
    <div className="flex flex-col h-full bg-background" dir="rtl">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b border-border bg-blue-500 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
          <Shield className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold">Admin Agent</h3>
            <Badge variant="outline" className="text-[10px] gap-1 border-blue-500 text-blue-600 dark:text-blue-300">
              <Terminal className="h-2.5 w-2.5" />
              قوة كاملة
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">12 أداة — تحكم كامل في المنصة (ملفات، packages، أوامر، git)</p>
        </div>
        {isStreaming && (
          <Badge variant="outline" className="gap-1.5 text-[10px] border-blue-500 text-blue-600 dark:text-blue-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            نشط
          </Badge>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-3xl px-4 py-8">
            {/* Hero */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-500 bg-blue-500 px-3 py-1 text-xs mb-4">
                <Shield className="h-3 w-3 text-blue-600 dark:text-blue-300" />
                <span className="font-medium text-blue-600 dark:text-blue-300">وضع الأدمن — قوة كاملة على المنصة</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2">
                <span className="bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 bg-clip-text text-transparent">
                  Admin Agent
                </span>
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                مساعد ذكي بصلاحية كاملة على المنصة. يقدر يقرأ ويعدّل الملفات، يثبّت packages، ينزّل كود من GitHub، يشغّل أوامر shell، ويحفظ التغييرات في git.
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-8">
              {adminFeatures.map((f) => (
                <div key={f.title} className="rounded-xl border border-border bg-muted p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 text-blue-600 dark:text-blue-300 mb-2">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div className="text-xs font-semibold">{f.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{f.desc}</div>
                </div>
              ))}
            </div>

            {/* Examples */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 mb-2">
                <Terminal className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-semibold">جرّب واحدة من دول</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {adminExamples.map((ex) => (
                  <button
                    key={ex.tag}
                    onClick={() => handleSend(ex.prompt)}
                    disabled={isStreaming}
                    className="group flex items-start gap-2.5 rounded-lg border border-border bg-muted p-3 text-right hover:border-blue-500 hover:bg-muted transition-all disabled:opacity-50"
                  >
                    <span className="text-lg shrink-0">{ex.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono mb-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{ex.tag}</div>
                      <p className="text-xs leading-snug">{ex.prompt}</p>
                    </div>
                    <ArrowLeft className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            </div>

            {/* Marketing skills test section */}
            <div className="mt-6 rounded-lg border border-blue-500 bg-gradient-to-br from-blue-500 to-blue-500 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">⚡</span>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-300">جرّب المهارات التسويقية</span>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto bg-blue-500 border-blue-500 text-blue-600 dark:text-blue-300">
                  AUTO-LOAD
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">
                لما تسأل سؤال تسويقي، الـ Agent هيحمّل الـ skills المناسبة تلقائياً ويستخدمها. هتلاقي مؤشر ⚡ فوق الرد بيورّيك إيه الـ skills اللي اتحملت.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {marketingExamples.map((ex) => (
                  <button
                    key={ex.tag}
                    onClick={() => handleSend(ex.prompt)}
                    disabled={isStreaming}
                    className="group flex items-start gap-2 rounded-md border border-blue-500 bg-background p-2 text-right hover:border-blue-500 hover:bg-blue-500 transition-all disabled:opacity-50"
                  >
                    <span className="text-sm shrink-0">{ex.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono mb-0.5 text-blue-600 dark:text-blue-300">{ex.tag}</div>
                      <p className="text-[10px] leading-snug">{ex.prompt}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Architecture note */}
            <div className="mt-8 rounded-lg border border-blue-500 bg-blue-500 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">كيف بيشتغل</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono leading-relaxed" dir="ltr">
                Admin → GLM (12 tools) → execute (read/write/run/install/fetch/git) → result → GLM → answer
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl py-4">
            {messages.map((m) => (
              <Message key={m.id} message={m} isAdmin />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border background p-3">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {adminExamples.map((ex) => (
            <button
              key={ex.tag}
              onClick={() => !isStreaming && setText(ex.prompt)}
              disabled={isStreaming}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs hover:bg-accent hover:border-blue-500 transition-colors disabled:opacity-50"
            >
              <span>{ex.icon}</span>
              <span className="font-medium">{ex.tag}</span>
            </button>
          ))}
        </div>
        <div className="relative rounded-xl border border-blue-500 bg-muted focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اطلب من الأدمن أي حاجة... (حلل، أصلح، ضيف ميزة، ثبّت package، نزّل من GitHub)"
            disabled={isStreaming}
            className="min-h-[48px] max-h-[200px] resize-none border-0 bg-transparent px-3 py-3 pl-24 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <button
              onClick={() => setThinking(!thinking)}
              title="وضع التفكير"
              className={cn(
                'flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
                thinking
                  ? 'bg-blue-500 text-blue-600 dark:text-blue-300 border border-blue-500'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent',
              )}
            >
              <Brain className="h-3 w-3" />
              <span className="hidden sm:inline">تفكير</span>
            </button>
            {isStreaming ? (
              <Button size="icon" onClick={handleStop} className="h-7 w-7 rounded-md bg-blue-500 hover:bg-blue-600">
                <Square className="h-3 w-3 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => handleSend()}
                disabled={!text.trim()}
                className="h-7 w-7 rounded-md bg-gradient-to-br from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700"
              >
                <Send className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
          <kbd className="rounded border border-border bg-muted px-1 font-mono text-[9px]">Enter</kbd> للإرسال · <kbd className="rounded border border-border bg-muted px-1 font-mono text-[9px]">Shift+Enter</kbd> سطر جديد
        </p>
      </div>
    </div>
  );
}

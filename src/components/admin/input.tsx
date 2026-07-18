"use client";

import { useRef, useState, useEffect } from "react";
import { Send, Brain, Square, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (text: string, enableThinking: boolean) => void;
  onStop: () => void;
  isStreaming: boolean;
  isAdmin?: boolean;
  suggestions?: { label: string; prompt: string; icon: string }[];
}

const DEFAULT_SUGGESTIONS = [
  { label: "كيف الحال", prompt: "إزيك؟ عامل إيه النهارده؟", icon: "👋" },
  { label: "اشرحلي حاجة", prompt: "اشرحلي إيه هو الـ Machine Learning ببساطة", icon: "🤖" },
  { label: "اكتبلي كود", prompt: "اكتبلي function في TypeScript بتحسب Fibonacci", icon: "💻" },
  { label: "ترجم", prompt: "ترجم: Artificial intelligence is transforming the world", icon: "🌍" },
];

const ADMIN_SUGGESTIONS = [
  { label: "تحليل المنصة", prompt: "حلل هيكل المنصة واعرضلي ملخص عن الملفات والتقنيات المستخدمة", icon: "🔍" },
  { label: "تثبيت package", prompt: "ثبّت package اسمه axios واعرضلي إزاي أستخدمه", icon: "📦" },
  { label: "تنزيل من GitHub", prompt: "نزّل الكود من https://raw.githubusercontent.com/user/repo/main/README.md واعرضلي محتواه", icon: "🌐" },
  { label: "أمر shell", prompt: "شغّل أمر git status واعرضلي حالة الـ repo", icon: "⚡" },
  { label: "إصلاح خطأ", prompt: "شغل lint واعرضلي أي أخطاء برمجية في المنصة، وصلحها لو فيه", icon: "🐛" },
  { label: "ميزة + حفظ", prompt: "ضيف API route على /api/health بيرجع حالة المنصة، وبعدين اعمل git commit و push", icon: "✨" },
];

export function ChatInput({ onSend, onStop, isStreaming, isAdmin, suggestions }: ChatInputProps) {
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const defaultSuggestions = isAdmin ? ADMIN_SUGGESTIONS : DEFAULT_SUGGESTIONS;
  const activeSuggestions = suggestions ?? defaultSuggestions;

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim(), thinking);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border background " dir="rtl">
      {/* Suggestions */}
      <div className="px-4 pt-3">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {activeSuggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => !isStreaming && setText(s.prompt)}
              disabled={isStreaming}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-xs hover:bg-accent hover:border-blue-500 transition-colors disabled:opacity-50"
            >
              <span>{s.icon}</span>
              <span className="font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input row */}
      <div className="px-4 pb-4 pt-1">
        <div className={cn(
          "relative rounded-2xl border bg-muted focus-within:ring-2 transition-all",
          isAdmin
            ? "border-blue-500 focus-within:border-blue-500 focus-within:ring-blue-500"
            : "border-border focus-within:border-blue-500 focus-within:ring-blue-500",
        )}>
          {isAdmin && (
            <div className="absolute -top-2.5 right-4 flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-300 border border-blue-500">
              <Shield className="h-2.5 w-2.5" />
              <span>وضع الأدمن</span>
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAdmin ? "اطلب من الأدمن أي حاجة... (حلل، أصلح، ضيف ميزة)" : "اكتب رسالتك هنا..."}
            disabled={isStreaming}
            className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3.5 pl-32 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
            <button
              onClick={() => setThinking(!thinking)}
              title="وضع التفكير"
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                thinking
                  ? "bg-blue-500 text-blue-600 dark:text-blue-300 border border-blue-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent",
              )}
            >
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">تفكير</span>
            </button>
            {isStreaming ? (
              <Button size="icon" onClick={onStop} className="h-8 w-8 rounded-lg bg-blue-500 hover:bg-blue-600">
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!text.trim()}
                className={cn(
                  "h-8 w-8 rounded-lg",
                  isAdmin
                    ? "bg-gradient-to-br from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700"
                    : "bg-gradient-to-br from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700",
                )}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
          <p className="text-[10px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[9px]">Enter</kbd> للإرسال · <kbd className="rounded border border-border bg-muted px-1 font-mono text-[9px]">Shift+Enter</kbd> سطر جديد
          </p>
          {isStreaming && (
            <Badge variant="outline" className="text-[10px] gap-1 text-blue-500 border-blue-500">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> جاري الإرسال
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

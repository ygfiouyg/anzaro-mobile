"use client";

import { useRef, useState, useEffect } from "react";
import { Send, Brain, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (text: string, enableThinking: boolean) => void;
  onStop: () => void;
  isStreaming: boolean;
}

const SUGGESTIONS = [
  { label: "Search the web", prompt: "Search the web for the latest news about AI agents and summarize the top 3 stories.", icon: "🌐" },
  { label: "Generate a PDF", prompt: "Generate a PDF report titled 'Q4 2024 Revenue Analysis' with a summary about quarterly performance trends.", icon: "📄" },
  { label: "Create a PPTX", prompt: "Create a 4-slide PowerPoint presentation about renewable energy covering solar, wind, hydro, and geothermal.", icon: "📊" },
  { label: "Analyze data", prompt: "Generate an Excel spreadsheet with sample sales data for 5 products across 4 quarters, then compute statistics.", icon: "📈" },
  { label: "Run code", prompt: "Execute this JavaScript: compute the first 20 Fibonacci numbers and return them as an array.", icon: "💻" },
  { label: "Generate image", prompt: "Generate an image of a futuristic city skyline at sunset with flying vehicles.", icon: "🎨" },
];

export function ChatInput({ onSend, onStop, isStreaming }: ChatInputProps) {
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="border-t border-border background ">
      {/* Suggestions */}
      <div className="px-4 pt-3">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => !isStreaming && setText(s.prompt)}
              disabled={isStreaming}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-xs hover:bg-accent hover:border-blue-500/30 transition-colors disabled:opacity-50"
            >
              <span>{s.icon}</span>
              <span className="font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input row */}
      <div className="px-4 pb-4 pt-1">
        <div className="relative rounded-2xl border border-border bg-muted focus-within:border-blue-500/40 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask DELTA AI anything... it can search the web, generate documents, run code, and orchestrate 60 tools."
            disabled={isStreaming}
            className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3.5 pr-32 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
            <button
              onClick={() => setThinking(!thinking)}
              title="Toggle reasoning mode"
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                thinking
                  ? "bg-blue-500 text-blue-600 dark:text-blue-300 border border-blue-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent",
              )}
            >
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Think</span>
            </button>
            {isStreaming ? (
              <Button size="icon" onClick={onStop} className="h-8 w-8 rounded-lg bg-blue-500 hover:bg-blue-600">
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button size="icon" onClick={handleSend} disabled={!text.trim()} className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700">
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
          <p className="text-[10px] text-muted-foreground">
            Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[9px]">Enter</kbd> to send · <kbd className="rounded border border-border bg-muted px-1 font-mono text-[9px]">Shift+Enter</kbd> for newline
          </p>
          {isStreaming && (
            <Badge variant="outline" className="text-[10px] gap-1 text-blue-500 border-blue-500/30">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Streaming
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

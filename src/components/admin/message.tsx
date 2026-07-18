"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Brain, ChevronDown, User, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";
import { ToolCallCard } from "./tool-call-card";

interface MessageProps {
  message: ChatMessage;
  isAdmin?: boolean;
}

export function Message({ message, isAdmin }: MessageProps) {
  const [showThinking, setShowThinking] = useState(false);
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 px-4 md:px-6 py-4", isUser ? "justify-end" : "justify-start")} dir="rtl">
      {!isUser && (
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-md",
          isAdmin
            ? "bg-gradient-to-br from-blue-500 to-blue-600"
            : "bg-gradient-to-br from-blue-500 to-blue-600",
        )}>
          {isAdmin ? <ShieldCheck className="h-4 w-4 text-white" /> : <Sparkles className="h-4 w-4 text-white" />}
        </div>
      )}

      <div className={cn("max-w-[85%] md:max-w-[75%] space-y-2", isUser && "order-first")}>
        {/* Skills loaded indicator */}
        {message.loadedSkills && message.loadedSkills.length > 0 && (
          <div className="rounded-lg border border-blue-500 bg-gradient-to-br from-blue-500 to-blue-500 px-3 py-2" dir="rtl">
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-300">
                تم تفعيل {message.loadedSkills.length} مهارة تلقائياً
              </span>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono ml-auto bg-blue-500 border-blue-500 text-blue-600 dark:text-blue-300">
                AUTO
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {message.loadedSkills.map((skill) => (
                <a
                  key={skill}
                  href={`#skill-${skill}`}
                  onClick={(e) => {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent("delta:view-skill", { detail: skill }));
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-500 border border-blue-500 px-1.5 py-0.5 text-[10px] font-mono text-blue-700 dark:text-blue-200 hover:bg-blue-500 transition-colors cursor-pointer"
                  title={`اضغط لتصفح skill: ${skill}`}
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  {skill}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Thinking */}
        {message.thinking && (
          <Collapsible open={showThinking} onOpenChange={setShowThinking} className="rounded-lg border border-blue-500 bg-blue-500">
            <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-300 hover:bg-blue-500 transition-colors">
              <Brain className="h-3.5 w-3.5" />
              <span className="font-medium">التفكير</span>
              <ChevronDown className={cn("h-3.5 w-3.5 mr-auto transition-transform", showThinking && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-3 text-xs text-muted-foreground italic whitespace-pre-wrap font-mono leading-relaxed border-t border-blue-500 pt-2 max-h-60 overflow-y-auto" dir="ltr">
                {message.thinking}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Tool calls */}
        {message.toolCalls?.map((tc) => (
          <ToolCallCard key={tc.id} exec={tc} />
        ))}

        {/* Content */}
        {message.content && (
          <div className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-gradient-to-br from-blue-600 to-blue-600 text-white rounded-tl-sm"
              : isAdmin
                ? "bg-blue-500 border border-blue-500 rounded-tr-sm"
                : "muted border border-border rounded-tr-sm",
          )}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:bg-muted prose-pre:text-xs prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-a:text-blue-500">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Streaming indicator */}
        {message.streaming && !message.content && !message.toolCalls?.length && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span>{isAdmin ? "الأدمن بيفكر..." : "بفكر..."}</span>
          </div>
        )}

        {/* Footer */}
        {!isUser && message.content && (
          <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
            <span>{new Date(message.timestamp).toLocaleTimeString("ar-EG")}</span>
            {message.toolCalls && message.toolCalls.length > 0 && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{message.toolCalls.length} أداة</Badge>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 shadow-md">
          <User className="h-4 w-4 text-white" />
        </div>
      )}
    </div>
  );
}

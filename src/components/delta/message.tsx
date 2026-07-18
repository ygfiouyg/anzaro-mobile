"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Brain, ChevronDown, User, Sparkles, Download, FileText, FileImage, Music, FileSpreadsheet, Presentation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ChatMessage, Artifact } from "./types";
import { ToolCallCard } from "./tool-call-card";

function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
  if (artifact.kind === "media" || (artifact.mime?.startsWith("image/") ?? false)) {
    const src = artifact.data.startsWith("data:") ? artifact.data : `data:${artifact.mime ?? "image/png"};base64,${artifact.data}`;
    return (
      <div className="my-2 rounded-lg overflow-hidden border border-border max-w-md">
        <img src={src} alt={artifact.name ?? "generated"} className="w-full h-auto" />
      </div>
    );
  }
  if (artifact.mime?.startsWith("audio/") ?? false) {
    const src = artifact.data.startsWith("data:") ? artifact.data : `data:${artifact.mime ?? "audio/mpeg"};base64,${artifact.data}`;
    return (
      <div className="my-2 rounded-lg border border-border p-3 bg-muted">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground"><Music className="h-3.5 w-3.5" /> Audio output</div>
        <audio controls className="w-full h-10"><source src={src} /></audio>
      </div>
    );
  }
  // file artifact — download link
  const ext = artifact.name?.split(".").pop()?.toLowerCase() ?? "";
  const Icon = ext === "pdf" ? FileText : ext === "pptx" ? Presentation : ext === "xlsx" || ext === "xls" ? FileSpreadsheet : ext === "docx" ? FileText : FileImage;
  const href = artifact.data.startsWith("data:") ? artifact.data : `data:${artifact.mime ?? "application/octet-stream"};base64,${artifact.data}`;
  return (
    <a
      href={href}
      download={artifact.name ?? `delta-ai-output.${ext || "bin"}`}
      className="my-2 flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent transition-colors group"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-500 text-blue-600 dark:text-blue-300">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{artifact.name ?? "Download file"}</div>
        <div className="text-[11px] text-muted-foreground font-mono">{artifact.mime ?? "application/octet-stream"}</div>
      </div>
      <Download className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
    </a>
  );
}

interface MessageProps {
  message: ChatMessage;
}

export function Message({ message }: MessageProps) {
  const [showThinking, setShowThinking] = useState(false);
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 px-4 md:px-6 py-4", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-blue-500 to-blue-500 shadow-md shadow-blue-500/20">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}

      <div className={cn("max-w-[85%] md:max-w-[75%] space-y-2", isUser && "order-first")}>
        {/* Thinking */}
        {message.thinking && (
          <Collapsible open={showThinking} onOpenChange={setShowThinking} className="rounded-lg border border-blue-500 bg-blue-500">
            <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-300 hover:bg-blue-500 transition-colors">
              <Brain className="h-3.5 w-3.5" />
              <span className="font-medium">Reasoning</span>
              <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", showThinking && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-3 text-xs text-muted-foreground italic whitespace-pre-wrap font-mono leading-relaxed border-t border-blue-500 pt-2 max-h-60 overflow-y-auto">
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
              ? "bg-gradient-to-br from-blue-600 to-blue-600 text-white rounded-tr-sm"
              : "muted border border-border rounded-tl-sm",
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

        {/* Artifacts */}
        {message.artifacts?.map((a, i) => (
          <ArtifactRenderer key={i} artifact={a} />
        ))}

        {/* Streaming indicator */}
        {message.streaming && !message.content && !message.toolCalls?.length && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span>GLM is thinking...</span>
          </div>
        )}

        {/* Footer meta */}
        {!isUser && message.content && (
          <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
            <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
            {message.toolCalls && message.toolCalls.length > 0 && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{message.toolCalls.length} tool{message.toolCalls.length > 1 ? "s" : ""}</Badge>
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

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Send, Loader2, AlertCircle, Wrench,
  ChevronDown, ChevronUp, Brain, RotateCcw, Clock, Check, Sparkles,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getToolByName, getToolByNameAsync } from "@/lib/agents/catalog";
import { useAuthStore } from "@/store/auth-store";
import type { CustomAgentMeta, AgentSSEEvent, ToolCallRecord, ChatTurn } from "./types";

interface AgentRunnerProps {
  agent: CustomAgentMeta;
  onBack: () => void;
}

export function AgentRunner({ agent, onBack }: AgentRunnerProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [toolMetaCache, setToolMetaCache] = useState<Map<string, { icon: string; description: string }>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pre-load tool metadata (for MCP tools that aren't in the curated catalog)
  useEffect(() => {
    const loadMeta = async () => {
      const cache = new Map<string, { icon: string; description: string }>();
      for (const tn of agent.tools) {
        const def = await getToolByNameAsync(tn);
        if (def) {
          cache.set(tn, { icon: def.icon, description: def.description });
        }
      }
      setToolMetaCache(cache);
    };
    loadMeta();
  }, [agent.tools]);

  // Helper to get tool display info (from cache or curated catalog)
  const getToolInfo = (name: string): { icon: string; description: string } | undefined => {
    const cached = toolMetaCache.get(name);
    if (cached) return cached;
    const curated = getToolByName(name);
    if (curated) return { icon: curated.icon, description: curated.description };
    return undefined;
  };

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, currentStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runAgent = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || running) return;

      const userTurn: ChatTurn = { role: "user", content: userMessage };
      const assistantTurn: ChatTurn = {
        role: "assistant",
        content: "",
        toolCalls: [],
        thinking: "",
        streaming: true,
      };
      setTurns((prev) => [...prev, userTurn, assistantTurn]);
      setInput("");
      setRunning(true);
      setCurrentStep(0);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = useAuthStore.getState().token;
        const res = await fetch(`/api/agents/${agent.id}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message: userMessage }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();
        let buffer = "";

        const updateAssistant = (fn: (t: ChatTurn) => ChatTurn) => {
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = fn(last);
            }
            return next;
          });
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]" || !payload) continue;
            let event: AgentSSEEvent;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }

            switch (event.type) {
              case "status":
                if (event.message) {
                  toast.info(event.message, { duration: 2000 });
                }
                break;
              case "step":
                setCurrentStep(event.step ?? 0);
                break;
              case "thinking":
                updateAssistant((t) => ({
                  ...t,
                  thinking: (t.thinking ?? "") + (event.content ?? ""),
                }));
                break;
              case "token":
                updateAssistant((t) => ({ ...t, content: t.content + (event.content ?? "") }));
                break;
              case "tool_start": {
                const tc: ToolCallRecord = {
                  id: event.tool_call_id ?? `tc-${Date.now()}-${Math.random()}`,
                  tool: event.tool ?? "",
                  args: event.args,
                  status: "running",
                  startedAt: Date.now(),
                };
                updateAssistant((t) => ({
                  ...t,
                  toolCalls: [...(t.toolCalls ?? []), tc],
                }));
                break;
              }
              case "tool_end": {
                updateAssistant((t) => {
                  const calls = (t.toolCalls ?? []).map((c) =>
                    c.id === event.tool_call_id || (c.tool === event.tool && c.status === "running")
                      ? {
                          ...c,
                          result: event.result,
                          status: "done" as const,
                          endedAt: Date.now(),
                        }
                      : c,
                  );
                  return { ...t, toolCalls: calls };
                });
                break;
              }
              case "done":
                updateAssistant((t) => ({ ...t, streaming: false }));
                setRunning(false);
                break;
              case "error":
                updateAssistant((t) => ({
                  ...t,
                  content: t.content + `\n\n❌ خطأ: ${event.error}`,
                  streaming: false,
                }));
                setRunning(false);
                toast.error(event.error || "حدث خطأ");
                break;
            }
          }
        }
        updateAssistant((t) => ({ ...t, streaming: false }));
      } catch (e: unknown) {
        if (e.name !== "AbortError") {
          toast.error(e instanceof Error ? e.message : String(e) || "فشل تشغيل الوكيل");
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: last.content + `\n\n❌ خطأ: ${e instanceof Error ? e.message : String(e)}`,
                streaming: false,
              };
            }
            return next;
          });
        }
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [agent.id, running],
  );

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const handleReset = () => {
    setTurns([]);
    setCurrentStep(0);
  };

  const handlePickSuggestion = (s: string) => {
    if (!running) runAgent(s);
  };

  const toolCallCount = turns.reduce(
    (sum, t) => sum + (t.toolCalls?.length ?? 0),
    0,
  );

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="border-b border-border background px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl shadow-md",
              agent.color,
            )}
          >
            {agent.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold truncate">{agent.name}</h2>
              {agent.nameEn && (
                <span className="text-[10px] text-muted-foreground font-mono">({agent.nameEn})</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-1">{agent.description}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {running && (
              <Badge variant="outline" className="gap-1.5 text-[10px] border-blue-500 text-blue-600 dark:text-blue-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                </span>
                خطوة {currentStep}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {agent.tools.length} أداة
            </Badge>
            {toolCallCount > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {toolCallCount} استدعاء
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── Messages ──────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
          {turns.length === 0 ? (
            <WelcomeRunner
              agent={agent}
              onPickSuggestion={handlePickSuggestion}
              disabled={running}
            />
          ) : (
            turns.map((turn, i) => (
              <TurnBubble
                key={i}
                turn={turn}
                expandedTools={expandedTools}
                onToggleTool={toggleTool}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Input ─────────────────────────────────────────── */}
      <div className="border-t border-border background p-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  runAgent(input);
                }
              }}
              placeholder={`اكتب رسالة لـ ${agent.name}...`}
              rows={1}
              className="min-h-[40px] max-h-32 resize-none text-sm"
              disabled={running}
            />
            {running ? (
              <Button
                onClick={handleStop}
                size="sm"
                variant="destructive"
                className="h-10 px-3"
              >
                إيقاف
              </Button>
            ) : (
              <Button
                onClick={() => runAgent(input)}
                disabled={!input.trim()}
                size="sm"
                className={cn(
                  "h-10 px-4 bg-gradient-to-r text-white shadow-md",
                  agent.color,
                )}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-muted-foreground">
              Enter للإرسال • Shift+Enter لسطر جديد
            </span>
            {turns.length > 0 && (
              <button
                onClick={handleReset}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                محادثة جديدة
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function WelcomeRunner({
  agent,
  onPickSuggestion,
  disabled,
}: {
  agent: CustomAgentMeta;
  onPickSuggestion: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-8"
    >
      <div
        className={cn(
          "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-3xl shadow-lg",
          agent.color,
        )}
      >
        {agent.icon}
      </div>
      <h2 className="text-xl font-bold mb-2">{agent.name}</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        {agent.description}
      </p>

      {/* Tools available */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-6 max-w-xl mx-auto">
        {agent.tools.slice(0, 12).map((tn) => {
          const t = getToolByName(tn);
          if (!t) return (
            <Badge key={tn} variant="outline" className="gap-1 text-[10px] bg-muted">
              <span>⚡</span>
              <span className="font-mono">{tn}</span>
            </Badge>
          );
          return (
            <Badge
              key={tn}
              variant="outline"
              className="gap-1 text-[10px] bg-muted"
            >
              <span>{t.icon}</span>
              <span className="font-mono">{tn}</span>
            </Badge>
          );
        })}
        {agent.tools.length > 12 && (
          <Badge variant="outline" className="text-[10px]">
            +{agent.tools.length - 12}
          </Badge>
        )}
      </div>

      {/* Suggestions */}
      {agent.suggestions.length > 0 && (
        <div className="space-y-2 max-w-xl mx-auto">
          <div className="flex items-center gap-2 justify-center mb-3">
            <Sparkles className="h-3 w-3 text-blue-500" />
            <span className="text-xs font-semibold">جرّب واحدة من دول</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {agent.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onPickSuggestion(s)}
                disabled={disabled}
                className="group flex items-start gap-2.5 rounded-lg border border-border bg-muted p-3 text-right hover:border-blue-500 hover:bg-muted transition-all disabled:opacity-50"
              >
                <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white text-[10px] font-bold", agent.color)}>
                  {i + 1}
                </div>
                <p className="flex-1 text-xs leading-snug">{s}</p>
                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-blue-500 mt-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function TurnBubble({
  turn,
  expandedTools,
  onToggleTool,
}: {
  turn: ChatTurn;
  expandedTools: Set<string>;
  onToggleTool: (id: string) => void;
}) {
  if (turn.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-gradient-to-br from-blue-500 to-blue-600 text-white px-4 py-2.5 shadow-md">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{turn.content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      {/* Tool calls (above the text) */}
      {turn.toolCalls?.map((tc) => (
        <ToolCallCard
          key={tc.id}
          tc={tc}
          expanded={expandedTools.has(tc.id)}
          onToggle={() => onToggleTool(tc.id)}
        />
      ))}

      {/* Thinking (collapsible) */}
      {turn.thinking && turn.thinking.trim() && (
        <details className="rounded-lg border border-blue-500 bg-blue-500 p-2.5">
          <summary className="cursor-pointer text-[11px] font-semibold text-blue-600 dark:text-blue-300 flex items-center gap-1.5">
            <Brain className="h-3 w-3" />
            التفكير ({turn.thinking.length} حرف)
          </summary>
          <div className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {turn.thinking}
          </div>
        </details>
      )}

      {/* Content */}
      {(turn.content || turn.streaming) && (
        <div className="rounded-2xl rounded-tr-md border border-border bg-background px-4 py-3">
          {turn.content ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{turn.content}</p>
          ) : turn.streaming ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>الوكيل بيفكر...</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Empty turn with no content yet but has tool calls — fine */}
      {!turn.content && !turn.streaming && (turn.toolCalls?.length ?? 0) === 0 && !turn.thinking && (
        <div className="rounded-2xl rounded-tr-md border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
          (لا توجد إجابة)
        </div>
      )}
    </motion.div>
  );
}

function ToolCallCard({
  tc,
  expanded,
  onToggle,
}: {
  tc: ToolCallRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  // For MCP tools, getToolByName returns undefined — fallback to ⚡ icon
  const t = getToolByName(tc.tool);
  const toolIcon = t?.icon ?? "⚡";
  const duration = tc.endedAt ? tc.endedAt - tc.startedAt : 0;

  return (
    <div className="rounded-lg border border-border bg-muted overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted text-right"
      >
        <Wrench className={cn("h-3.5 w-3.5", tc.status === "running" ? "text-blue-500 animate-pulse" : "text-blue-500")} />
        <span className="text-base">{toolIcon}</span>
        <span className="text-xs font-mono font-semibold">{tc.tool}</span>
        <Badge variant="outline" className="text-[9px] ml-1">
          {tc.status === "running" ? "قيد التشغيل" : "تم"}
        </Badge>
        {tc.endedAt && (
          <Badge variant="outline" className="text-[9px] gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {duration}ms
          </Badge>
        )}
        <span className="ml-auto" />
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border background"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2.5">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] font-bold uppercase text-muted-foreground">المدخلات</span>
                </div>
                <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted rounded p-2 max-h-40 overflow-y-auto">
                  {JSON.stringify(tc.args, null, 2)}
                </pre>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] font-bold uppercase text-muted-foreground">النتيجة</span>
                  {tc.status === "done" && <Check className="h-2.5 w-2.5 text-blue-500" />}
                </div>
                {tc.result !== undefined ? (
                  <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted rounded p-2 max-h-40 overflow-y-auto">
                    {typeof tc.result === "string"
                      ? tc.result
                      : JSON.stringify(tc.result, null, 2)}
                  </pre>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground p-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    في الانتظار...
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

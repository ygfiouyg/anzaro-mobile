"use client";

import { useState } from "react";
import { ChevronRight, Loader2, CheckCircle2, XCircle, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ToolExecution } from "./types";

const CATEGORY_COLORS: Record<string, string> = {
  "file.": "amber",
  "web.": "emerald",
  "media.": "pink",
  "doc.": "sky",
  "code.": "violet",
  "data.": "rose",
};

function colorFor(tool: string) {
  const prefix = Object.keys(CATEGORY_COLORS).find((k) => tool.startsWith(k));
  return CATEGORY_COLORS[prefix ?? ""] ?? "slate";
}

export function ToolCallCard({ exec }: { exec: ToolExecution }) {
  const [expanded, setExpanded] = useState(false);
  const color = colorFor(exec.tool);
  const colorClasses: Record<string, string> = {
    amber: "border-blue-500 bg-blue-500",
    emerald: "border-blue-500 bg-blue-500",
    pink: "border-blue-500 bg-blue-500",
    sky: "border-blue-500 bg-blue-500",
    violet: "border-blue-500 bg-blue-500",
    rose: "border-blue-500 bg-blue-500",
    slate: "border-border bg-muted",
  };

  return (
    <div className={cn("my-2 rounded-lg border overflow-hidden", colorClasses[color])}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent transition-colors"
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md background">
          {exec.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          ) : exec.status === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-blue-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Terminal className="h-3 w-3 text-muted-foreground shrink-0" />
            <code className="text-xs font-mono font-semibold">{exec.tool}</code>
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono uppercase">
              {exec.status === "running" ? "running" : exec.status}
            </Badge>
          </div>
        </div>
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2.5 space-y-2 bg-background">
          {exec.args !== undefined && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Arguments</div>
              <pre className="text-[11px] font-mono muted rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(exec.args, null, 2)}
              </pre>
            </div>
          )}
          {exec.result !== undefined && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Result</div>
              <pre className="text-[11px] font-mono muted rounded p-2 overflow-x-auto max-h-60 overflow-y-auto">
                {typeof exec.result === "string" ? exec.result : JSON.stringify(exec.result, null, 2)}
              </pre>
            </div>
          )}
          {exec.error && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 mb-1">Error</div>
              <pre className="text-[11px] font-mono bg-blue-500 text-blue-600 dark:text-blue-300 rounded p-2">{exec.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

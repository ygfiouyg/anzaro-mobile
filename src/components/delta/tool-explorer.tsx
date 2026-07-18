"use client";

import { useState, useMemo } from "react";
import {
  FolderTree, Globe, Image, FileText, Code2, Database, Search, ChevronDown, Wrench, X, type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ToolCategory, ToolDef } from "./types";

const ICONS: Record<string, LucideIcon> = {
  FolderTree, Globe, Image, FileText, Code2, Database,
};

const COLOR_MAP: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  amber: { dot: "bg-blue-500", bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-300", border: "border-blue-500" },
  emerald: { dot: "bg-blue-500", bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-300", border: "border-blue-500" },
  pink: { dot: "bg-blue-500", bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-300", border: "border-blue-500" },
  sky: { dot: "bg-blue-500", bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-300", border: "border-blue-500" },
  violet: { dot: "bg-blue-500", bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-300", border: "border-blue-500" },
  rose: { dot: "bg-blue-500", bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-300", border: "border-blue-500" },
};

interface ToolExplorerProps {
  categories: ToolCategory[];
  open: boolean;
  onClose: () => void;
  onToolSelect?: (tool: ToolDef) => void;
}

export function ToolExplorer({ categories, open, onClose, onToolSelect }: ToolExplorerProps) {
  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(categories.map((c) => c.category)));

  const filtered = useMemo(() => {
    if (!query.trim()) return categories;
    const q = query.toLowerCase();
    return categories
      .map((c) => ({ ...c, tools: c.tools.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) }))
      .filter((c) => c.tools.length > 0);
  }, [query, categories]);

  const totalTools = categories.reduce((sum, c) => sum + c.tools.length, 0);

  if (!open) return null;

  return (
    <aside className="hidden md:flex w-80 shrink-0 flex-col border-r border-border bg-muted ">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-semibold">MCP Tool Registry</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-[10px]">{totalTools} tools</Badge>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search 60 tools..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-8 text-sm bg-background"
          />
        </div>
      </div>

      {/* Categories */}
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-1">
          {filtered.map((cat) => {
            const Icon = ICONS[cat.icon] ?? Wrench;
            const color = COLOR_MAP[cat.color];
            const isOpen = openCats.has(cat.category);
            return (
              <Collapsible key={cat.category} open={isOpen} onOpenChange={(o) => {
                const next = new Set(openCats);
                if (o) next.add(cat.category); else next.delete(cat.category);
                setOpenCats(next);
              }}>
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent transition-colors">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md ${color.bg} ${color.text}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-medium flex-1 text-left">{cat.label}</span>
                  <Badge variant="outline" className={`text-[10px] font-mono ${color.border} ${color.text}`}>{cat.tools.length}</Badge>
                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-3 border-l border-border pl-2 pb-1 space-y-0.5">
                    {cat.tools.map((tool) => (
                      <button
                        key={tool.name}
                        onClick={() => onToolSelect?.(tool)}
                        className="group w-full rounded-md px-2.5 py-1.5 text-left hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
                          <code className="text-xs font-mono text-foreground group-hover:text-blue-500 transition-colors">{tool.name}</code>
                        </div>
                        <p className="mt-0.5 pl-3.5 text-[11px] text-muted-foreground line-clamp-1">{tool.description}</p>
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">No tools match "{query}"</div>
          )}
        </div>
      </ScrollArea>

      {/* Footer hint */}
      <div className="border-t border-border px-4 py-2.5">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Click a tool to insert it into your prompt. GLM auto-selects tools based on your request.
        </p>
      </div>
    </aside>
  );
}

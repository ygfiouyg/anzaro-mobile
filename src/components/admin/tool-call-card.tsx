"use client";

import { useState } from "react";
import { ChevronDown, Loader2, CheckCircle2, XCircle, Terminal, FileText, Search, FolderTree, Edit3, FilePlus, Bug, Package, Globe, GitCommit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ToolExecution } from "./types";

const TOOL_ICONS: Record<string, typeof Terminal> = {
  list_files: FolderTree,
  read_file: FileText,
  write_file: FilePlus,
  modify_file: Edit3,
  delete_file: Trash2,
  search_code: Search,
  run_lint: Bug,
  analyze_structure: FolderTree,
  run_command: Terminal,
  install_package: Package,
  fetch_url: Globe,
  git_commit_push: GitCommit,
};

const TOOL_LABELS: Record<string, string> = {
  list_files: "عرض الملفات",
  read_file: "قراءة ملف",
  write_file: "كتابة ملف",
  modify_file: "تعديل ملف",
  delete_file: "حذف ملف",
  search_code: "بحث في الكود",
  run_lint: "فحص الكود",
  analyze_structure: "تحليل الهيكل",
  run_command: "تشغيل أمر",
  install_package: "تثبيت package",
  fetch_url: "تنزيل من URL",
  git_commit_push: "Git commit + push",
};

export function ToolCallCard({ exec }: { exec: ToolExecution }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[exec.tool] ?? Terminal;
  const label = TOOL_LABELS[exec.tool] ?? exec.tool;

  return (
    <div className="my-2 rounded-lg border border-blue-500 bg-blue-500 overflow-hidden" dir="rtl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-right hover:bg-blue-500 transition-colors"
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
            <Icon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-semibold">{label}</span>
            <code className="text-[10px] font-mono text-muted-foreground">{exec.tool}</code>
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] h-4 px-1 font-mono uppercase mr-auto",
                exec.status === "running" && "border-blue-500 text-blue-600 dark:text-blue-300",
                exec.status === "success" && "border-blue-500 text-blue-600 dark:text-blue-300",
                exec.status === "error" && "border-blue-500 text-blue-600 dark:text-blue-300",
              )}
            >
              {exec.status === "running" ? "جاري" : exec.status === "success" ? "تم" : "خطأ"}
            </Badge>
          </div>
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="border-t border-blue-500 px-3 py-2.5 space-y-2 bg-background">
          {exec.args !== undefined && Object.keys(exec.args as object).length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">المدخلات</div>
              <pre className="text-[11px] font-mono muted rounded p-2 overflow-x-auto max-h-40 overflow-y-auto" dir="ltr">
                {JSON.stringify(exec.args, null, 2)}
              </pre>
            </div>
          )}
          {exec.result !== undefined && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">النتيجة</div>
              <pre className="text-[11px] font-mono muted rounded p-2 overflow-x-auto max-h-72 overflow-y-auto" dir="ltr">
                {typeof exec.result === "string" ? exec.result : JSON.stringify(exec.result, null, 2)}
              </pre>
            </div>
          )}
          {exec.error && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 mb-1">الخطأ</div>
              <pre className="text-[11px] font-mono bg-blue-500 text-blue-600 dark:text-blue-300 rounded p-2" dir="ltr">{exec.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

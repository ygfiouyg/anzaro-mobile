"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, RefreshCw, Play, CheckCircle2, XCircle, Clock,
  Activity, ChevronDown, ChevronRight, X, AlertCircle, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth-store";

interface JobStep {
  id: string;
  stepName: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  output?: unknown;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

interface Job {
  id: string;
  type: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  sourceTool: string | null;
  ownerId: string | null;
  progress: number;
  errorMessage: string | null;
  webhookUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  inputs: unknown;
  result: unknown;
  steps?: JobStep[];
}

interface JobsMonitorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_META = {
  pending: { label: "في الانتظار", icon: Clock, color: "text-blue-500", bg: "bg-blue-500" },
  running: { label: "قيد التشغيل", icon: Loader2, color: "text-blue-500", bg: "bg-blue-500" },
  done: { label: "تم", icon: CheckCircle2, color: "text-blue-500", bg: "bg-blue-500" },
  failed: { label: "فشل", icon: XCircle, color: "text-blue-500", bg: "bg-blue-500" },
  cancelled: { label: "ملغي", icon: XCircle, color: "text-muted-foreground", bg: "bg-muted" },
};

export function JobsMonitor({ open, onOpenChange }: JobsMonitorProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "running" | "done" | "failed">("all");
  const [liveStream, setLiveStream] = useState<Job | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch("/api/mcp/jobs?limit=50", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e: unknown) {
      toast.error("فشل تحميل الـ jobs: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load jobs when opened
  useEffect(() => {
    if (open) {
      fetchJobs();
    } else {
      // Cleanup stream when closed
      abortRef.current?.abort();
      setLiveStream(null);
      setExpandedJob(null);
    }
  }, [open, fetchJobs]);

  // Auto-refresh every 5s if there are running jobs
  useEffect(() => {
    if (!open) return;
    const hasRunning = jobs.some((j) => j.status === "running" || j.status === "pending");
    if (!hasRunning) return;
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [open, jobs, fetchJobs]);

  // Stream a specific job
  const streamJob = useCallback(async (jobId: string) => {
    // Cancel any existing stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLiveStream(null);

    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/mcp/jobs/${jobId}/stream`, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

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
          if (payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload);
            if (event.type === "update" || event.type === "status") {
              setLiveStream({
                id: event.jobId,
                type: "",
                status: event.status,
                sourceTool: null,
                ownerId: null,
                progress: event.progress,
                errorMessage: null,
                webhookUrl: null,
                startedAt: null,
                completedAt: null,
                createdAt: "",
                updatedAt: "",
                inputs: null,
                result: event.result,
                steps: event.steps,
              });
            } else if (event.type === "done") {
              setLiveStream((prev) => prev ? { ...prev, status: event.status, progress: event.progress, result: event.result, errorMessage: event.errorMessage } : prev);
              // Refresh the jobs list
              fetchJobs();
            }
          } catch {}
        }
      }
    } catch (e: unknown) {
      if (e.name !== "AbortError") {
        toast.error("Stream error: " + (e instanceof Error ? e.message : String(e)));
      }
    }
  }, [fetchJobs]);

  const filteredJobs = jobs.filter((j) => {
    if (filter === "all") return true;
    if (filter === "running") return j.status === "running" || j.status === "pending";
    return j.status === filter;
  });

  const stats = {
    total: jobs.length,
    running: jobs.filter((j) => j.status === "running" || j.status === "pending").length,
    done: jobs.filter((j) => j.status === "done").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 " onClick={() => onOpenChange(false)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-[95vw] sm:max-w-5xl h-[90vh] bg-background rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            <h2 className="text-sm font-bold">مراقب المهام (Jobs Monitor)</h2>
            <Badge variant="outline" className="text-[10px] bg-muted">
              {stats.total} total
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={fetchJobs} disabled={loading} className="h-8">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="h-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats + filters */}
        <div className="border-b border-border px-4 py-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-2 mr-auto">
            <StatBadge label="نشط" value={stats.running} color="text-blue-500" icon={<Loader2 className="h-3 w-3" />} />
            <StatBadge label="تم" value={stats.done} color="text-blue-500" icon={<CheckCircle2 className="h-3 w-3" />} />
            <StatBadge label="فشل" value={stats.failed} color="text-blue-500" icon={<XCircle className="h-3 w-3" />} />
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {(["all", "running", "done", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  filter === f ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f === "all" ? "الكل" : f === "running" ? "نشط" : f === "done" ? "تم" : "فشل"}
              </button>
            ))}
          </div>
        </div>

        {/* Live stream view */}
        {liveStream && (
          <div className="border-b border-blue-500 bg-blue-500 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-300">
                  بث مباشر — {liveStream.id.slice(0, 12)}...
                </span>
              </div>
              <button
                onClick={() => {
                  abortRef.current?.abort();
                  setLiveStream(null);
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                إيقاف البث
              </button>
            </div>
            <JobProgressBar job={liveStream} />
          </div>
        )}

        {/* Jobs list */}
        <div className="flex-1 overflow-y-auto">
          {loading && jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-xs text-muted-foreground mt-3">جاري تحميل الـ jobs...</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Activity className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">مفيش jobs {filter !== "all" ? `في تصنيف "${filter}"` : ""}</p>
              <p className="text-xs text-muted-foreground mt-1">
                الـ jobs بتظهر هنا لما الوكيل أو n8n يشغل workflow.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              <AnimatePresence>
                {filteredJobs.map((job) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="px-4 py-3 hover:bg-muted"
                  >
                    <JobRow
                      job={job}
                      expanded={expandedJob === job.id}
                      onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                      onStream={() => streamJob(job.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function StatBadge({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1">
      <span className={color}>{icon}</span>
      <span className="text-xs font-bold">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function JobRow({
  job,
  expanded,
  onToggle,
  onStream,
}: {
  job: Job;
  expanded: boolean;
  onToggle: () => void;
  onStream: () => void;
}) {
  const statusMeta = STATUS_META[job.status] || STATUS_META.pending;
  const StatusIcon = statusMeta.icon;
  const isRunning = job.status === "running" || job.status === "pending";

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 text-right"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0", statusMeta.bg)}>
          <StatusIcon className={cn("h-4 w-4", statusMeta.color, job.status === "running" && "animate-spin")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold truncate">{job.type}</span>
            <Badge variant="outline" className={cn("text-[9px]", statusMeta.color, statusMeta.bg)}>
              {statusMeta.label}
            </Badge>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">
            {job.id.slice(0, 20)}... • {new Date(job.createdAt).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
          </div>
        </div>
        {isRunning && (
          <div className="w-20 shrink-0">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-500 transition-all"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <div className="text-[9px] text-muted-foreground text-center mt-0.5">{job.progress}%</div>
          </div>
        )}
        {isRunning && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStream();
            }}
            className="flex items-center gap-1 rounded-md border border-blue-500 bg-blue-500 px-2 py-1 text-[10px] text-blue-600 dark:text-blue-300 hover:bg-blue-500 shrink-0"
          >
            <Zap className="h-3 w-3" />
            بث مباشر
          </button>
        )}
      </button>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="mt-2 ml-8 space-y-2"
        >
          {/* Progress bar */}
          <div className="rounded-md bg-muted p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground">التقدم</span>
              <span className="text-[10px] font-bold">{job.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-background overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  job.status === "failed" ? "bg-blue-500" : job.status === "done" ? "bg-blue-500" : "bg-gradient-to-r from-blue-500 to-blue-500",
                )}
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          {Boolean(job.steps && job.steps.length > 0) && (
            <div className="rounded-md border border-border background p-2">
              <div className="text-[10px] font-semibold text-muted-foreground mb-2">الخطوات ({job.steps.length})</div>
              <div className="space-y-1">
                {job.steps.map((step, i) => {
                  const stepMeta = STATUS_META[step.status] || STATUS_META.pending;
                  const StepIcon = stepMeta.icon;
                  return (
                    <div key={step.id} className="flex items-center gap-2 text-xs">
                      <span className="text-[10px] text-muted-foreground w-4">{i + 1}.</span>
                      <StepIcon className={cn("h-3 w-3", stepMeta.color, step.status === "running" && "animate-spin")} />
                      <span className="font-mono flex-1">{step.stepName}</span>
                      <Badge variant="outline" className={cn("text-[9px]", stepMeta.color, stepMeta.bg)}>
                        {stepMeta.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {job.errorMessage && (
            <div className="rounded-md border border-blue-500 bg-blue-500 p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-300">الخطأ</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono break-all">{job.errorMessage}</p>
            </div>
          )}

          {/* Result */}
          {job.result && (
            <div className="rounded-md border border-blue-500 bg-blue-500 p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-300">النتيجة</span>
              </div>
              <pre className="text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Inputs */}
          {job.inputs && (
            <details className="rounded-md border border-border background p-2">
              <summary className="cursor-pointer text-[10px] font-semibold text-muted-foreground">المدخلات</summary>
              <pre className="text-[10px] font-mono whitespace-pre-wrap mt-1 max-h-32 overflow-y-auto">
                {JSON.stringify(job.inputs, null, 2)}
              </pre>
            </details>
          )}
        </motion.div>
      )}
    </div>
  );
}

function JobProgressBar({ job }: { job: Job }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold">{job.type}</span>
        <span className="text-xs font-bold">{job.progress}%</span>
      </div>
      <div className="h-2 rounded-full bg-background overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            job.status === "failed" ? "bg-blue-500" : job.status === "done" ? "bg-blue-500" : "bg-gradient-to-r from-blue-500 to-blue-500",
          )}
          style={{ width: `${job.progress}%` }}
        />
      </div>
      {Boolean(job.steps && job.steps.length > 0) && (
        <div className="flex gap-1 mt-2">
          {job.steps.map((s) => {
            const meta = STATUS_META[s.status] || STATUS_META.pending;
            return (
              <div
                key={s.id}
                className={cn("flex-1 h-1 rounded-full", meta.bg)}
                title={`${s.stepName}: ${meta.label}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

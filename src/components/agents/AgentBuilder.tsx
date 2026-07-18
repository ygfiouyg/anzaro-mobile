"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Play, Pencil, Trash2, Loader2, Sparkles,
  RefreshCw, AlertCircle, ArrowLeft, Bot, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AGENT_TOOL_CATALOG,
  getToolByName,
} from "@/lib/agents/catalog";
import { RECIPES } from "@/lib/agents/recipes";
import { AgentForm, type AgentFormState } from "./AgentForm";
import { AgentRunner } from "./AgentRunner";
import { McpCatalogHub } from "./McpCatalogHub";
import { useAuthStore } from "@/store/auth-store";
import type { CustomAgentMeta } from "./types";

type View = "list" | "create" | "edit" | "run" | "catalog";

export function AgentBuilder() {
  const [view, setView] = useState<View>("list");
  const [agents, setAgents] = useState<CustomAgentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CustomAgentMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomAgentMeta | null>(null);

  // ── Auth header (avoids 401 on protected /api/agents endpoints) ──
  const token = useAuthStore((s) => s.token);
  const authHeaders = useCallback(
    (extra: Record<string, string> = {}) => ({
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    }),
    [token],
  );

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents", { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (e: unknown) {
      toast.error("فشل تحميل الوكلاء: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // ── Create new agent ───────────────────────────────────────
  const handleCreate = async (form: AgentFormState) => {
    setSaving(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      toast.success(`تم إنشاء الوكيل "${data.agent.name}"`);
      await fetchAgents();
      setView("list");
    } catch (e: unknown) {
      toast.error("فشل إنشاء الوكيل: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  // ── Update existing agent ──────────────────────────────────
  const handleUpdate = async (form: AgentFormState) => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${selected.id}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      toast.success("تم حفظ التعديلات");
      await fetchAgents();
      setSelected(data.agent);
      setView("list");
    } catch (e: unknown) {
      toast.error("فشل حفظ التعديلات: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete agent ───────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/agents/${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`تم حذف الوكيل "${deleteTarget.name}"`);
      await fetchAgents();
    } catch (e: unknown) {
      toast.error("فشل حذف الوكيل: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── Run agent ──────────────────────────────────────────────
  const handleRun = (agent: CustomAgentMeta) => {
    setSelected(agent);
    setView("run");
  };

  const handleEdit = (agent: CustomAgentMeta) => {
    setSelected(agent);
    setView("edit");
  };

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────

  if (view === "run" && selected) {
    return <AgentRunner agent={selected} onBack={() => setView("list")} />;
  }

  // ── MCP Catalog Hub view ──────────────────────────────────
  // تفاعلي: ربط MCP servers خارجية + dry-run للأدوات المحلية
  if (view === "catalog") {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border background px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("list")}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-500" />
                مركز MCP — ربط السيرفرات + Dry-Run
              </h2>
              <p className="text-[11px] text-muted-foreground">
                اربط MCP server خارجي (dynamic SSE) أو جَرِّب أي أداة محلية
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6">
            <McpCatalogHub />
          </div>
        </div>
      </div>
    );
  }

  if (view === "create" || view === "edit") {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border background px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("list")}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1">
              <h2 className="text-sm font-bold">
                {view === "create" ? "إنشاء وكيل جديد" : "تعديل الوكيل"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {view === "create"
                  ? `صمّم وكيلك من ${AGENT_TOOL_CATALOG.length} أداة متاحة`
                  : selected?.name}
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 p-4 overflow-hidden">
          <AgentForm
            initial={view === "edit" ? selected : null}
            onSave={view === "create" ? handleCreate : handleUpdate}
            onCancel={() => setView("list")}
            saving={saving}
          />
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border background px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold">استوديو بناء الوكلاء</h2>
              <p className="text-[11px] text-muted-foreground">
                صمّم وكلاء ذكاء اصطناعيين مخصصين بمهارات محددة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setView("catalog")}
              className="h-8 gap-1.5 text-xs border border-blue-500 text-blue-600 hover:bg-blue-500 dark:text-blue-300"
            >
              <Globe className="h-3.5 w-3.5" />
              MCP Catalog
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchAgents}
              disabled={loading}
              className="h-8 text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSelected(null);
                setView("create");
              }}
              className="h-8 gap-1.5 text-xs bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              وكيل جديد
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-xs text-muted-foreground mt-3">جاري تحميل الوكلاء...</p>
            </div>
          ) : agents.length === 0 ? (
            <EmptyState
              onCreate={() => {
                setSelected(null);
                setView("create");
              }}
            />
          ) : (
            <>
              {/* Stats banner */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard
                  label="وكلاء"
                  value={agents.length}
                  icon="🤖"
                  color="from-blue-500 to-blue-500"
                />
                <StatCard
                  label="إجمالي الأدوات"
                  value={AGENT_TOOL_CATALOG.length}
                  icon="🛠️"
                  color="from-blue-500 to-blue-500"
                />
                <StatCard
                  label="إجمالي التشغيلات"
                  value={agents.reduce((s, a) => s + a.runCount, 0)}
                  icon="▶️"
                  color="from-blue-500 to-blue-500"
                />
                <StatCard
                  label="وكلاء عامين"
                  value={agents.filter((a) => a.isPublic).length}
                  icon="🌍"
                  color="from-blue-500 to-blue-500"
                />
              </div>

              {/* Recipes section */}
              <RecipesSection onImported={fetchAgents} />

              {/* Agents grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {agents.map((agent, i) => (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <AgentCard
                        agent={agent}
                        onRun={() => handleRun(agent)}
                        onEdit={() => handleEdit(agent)}
                        onDelete={() => setDeleteTarget(agent)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الوكيل؟</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف "{deleteTarget?.name}"؟ هذا الإجراء لا يمكن التراجع عنه.
              سيتم حذف الوكيل وكل بياناته نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn("flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br text-xs", color)}>
          {icon}
        </div>
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function AgentCard({
  agent,
  onRun,
  onEdit,
  onDelete,
}: {
  agent: CustomAgentMeta;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card hover:border-blue-500 transition-all">
      {/* Gradient header strip */}
      <div className={cn("h-1.5 bg-gradient-to-r", agent.color)} />

      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-md",
              agent.color,
            )}
          >
            {agent.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold truncate">{agent.name}</h3>
              {agent.isPublic && (
                <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1">
                  <Sparkles className="h-2 w-2" />
                  عام
                </Badge>
              )}
            </div>
            {agent.nameEn && (
              <p className="text-[10px] text-muted-foreground font-mono">{agent.nameEn}</p>
            )}
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
              {agent.description}
            </p>
          </div>
        </div>

        {/* Tools preview */}
        <div className="flex flex-wrap gap-1 mb-3 min-h-[20px]">
          {agent.tools.slice(0, 6).map((tn) => {
            const t = getToolByName(tn);
            if (!t) return (
              <Badge key={tn} variant="outline" className="text-[9px] font-mono">
                {tn}
              </Badge>
            );
            return (
              <Badge key={tn} variant="outline" className="text-[9px] gap-0.5 bg-muted">
                <span>{t.icon}</span>
                <span className="font-mono">{t.name}</span>
              </Badge>
            );
          })}
          {agent.tools.length > 6 && (
            <Badge variant="outline" className="text-[9px]">
              +{agent.tools.length - 6}
            </Badge>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-[10px] text-muted-foreground">
            {agent.runCount > 0 ? `▶ ${agent.runCount} مرة` : "لم يُشغّل بعد"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="h-7 w-7 p-0"
              title="تعديل"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              title="حذف"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={onRun}
              className={cn(
                "h-7 gap-1.5 text-xs bg-gradient-to-r text-white shadow-sm",
                agent.color,
              )}
            >
              <Play className="h-3 w-3" />
              تشغيل
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg mb-4">
        <Bot className="h-10 w-10 text-white" />
      </div>
      <h3 className="text-xl font-bold mb-2">مفيش وكلاء بعد</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        ابدأ بإنشاء أول وكيل لك. اختار اسم ووصف وأيقونة ولون،
        حدّد الأدوات اللي محتاجها، واكتب الـ system prompt — أو خلّي الـ AI يولّده لك.
      </p>
      <div className="flex flex-col items-center gap-2">
        <Button
          onClick={onCreate}
          className="gap-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
        >
          <Plus className="h-4 w-4" />
          إنشاء أول وكيل
        </Button>
        <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          <span>{AGENT_TOOL_CATALOG.length} أداة متاحة للاختيار</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Recipes Section ─────────────────────────────────────────

function RecipesSection({ onImported }: { onImported: () => void }) {
  const [importing, setImporting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleImport = async (recipeId: string) => {
    setImporting(recipeId);
    try {
      const res = await fetch("/api/agents/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      toast.success(data.message || "تم استيراد الوصفة");
      onImported();
    } catch (e: unknown) {
      toast.error("فشل الاستيراد: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImporting(null);
    }
  };

  const displayed = expanded ? RECIPES : RECIPES.slice(0, 4);

  return (
    <div className="mb-8 rounded-xl border border-blue-500 bg-blue-500 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📚</span>
          <h3 className="text-sm font-bold">وصفات جاهزة (Recipes)</h3>
          <Badge variant="outline" className="text-[9px] bg-blue-500 border-blue-500 text-blue-600 dark:text-blue-300">
            {RECIPES.length} وصفة
          </Badge>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {expanded ? "إخفاء" : `عرض الكل (${RECIPES.length})`}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        استورد وصفة جاهزة بضغطة واحدة — كل وصفة = وكيل كامل بأدوات وبرومبت جاهز.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        {displayed.map((recipe) => (
          <div
            key={recipe.id}
            className="group rounded-lg border border-border background p-3 hover:border-blue-500 transition-all"
          >
            <div className="flex items-start gap-2 mb-2">
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-base", recipe.color)}>
                {recipe.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold truncate">{recipe.name}</h4>
                <p className="text-[9px] text-muted-foreground font-mono">{recipe.nameEn}</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2 leading-snug">
              {recipe.description}
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[9px] bg-muted">
                {recipe.tools.length} أداة
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleImport(recipe.id)}
                disabled={importing === recipe.id}
                className="h-6 px-2 text-[10px] gap-1 hover:bg-blue-500"
              >
                {importing === recipe.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-3 w-3" />
                    استيراد
                  </>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

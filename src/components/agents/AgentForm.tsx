"use client";

import { useState, useEffect, useMemo } from "react";
import { Sparkles, Loader2, Check, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AGENT_TOOL_CATALOG,
  CATEGORY_META,
  getToolsByCategory,
  type ToolCategory,
  type AgentToolDef,
} from "@/lib/agents/catalog";
import {
  COLOR_PRESETS,
  ICON_PRESETS,
  type CustomAgentMeta,
} from "./types";
import { useAuthStore } from "@/store/auth-store";

export interface AgentFormState {
  name: string;
  nameEn: string;
  description: string;
  icon: string;
  color: string;
  systemPrompt: string;
  tools: string[];
  suggestions: string[];
  category: string;
  isPublic: boolean;
}

interface AgentFormProps {
  initial?: CustomAgentMeta | null;
  onSave: (state: AgentFormState) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

const EMPTY_FORM: AgentFormState = {
  name: "",
  nameEn: "",
  description: "",
  icon: "🤖",
  color: "from-blue-500 to-blue-500",
  systemPrompt: "",
  tools: [],
  suggestions: [],
  category: "custom",
  isPublic: false,
};

const CATEGORIES = [
  { value: "custom", label: "مخصص" },
  { value: "content", label: "محتوى" },
  { value: "research", label: "بحث" },
  { value: "dev", label: "تطوير" },
  { value: "business", label: "أعمال" },
  { value: "education", label: "تعليم" },
];

export function AgentForm({ initial, onSave, onCancel, saving }: AgentFormProps) {
  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM);
  const [generating, setGenerating] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<ToolCategory>>(new Set(["search"]));
  const [newSuggestion, setNewSuggestion] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [mcpTools, setMcpTools] = useState<AgentToolDef[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);

  // Load initial values when editing
  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        nameEn: initial.nameEn || "",
        description: initial.description,
        icon: initial.icon,
        color: initial.color,
        systemPrompt: initial.systemPrompt,
        tools: initial.tools,
        suggestions: initial.suggestions,
        category: initial.category,
        isPublic: initial.isPublic,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [initial]);

  const toolsByCat = useMemo(() => {
    const base = getToolsByCategory();
    // Add MCP tools if loaded
    if (mcpTools.length > 0) {
      base.mcp = mcpTools;
    }
    return base;
  }, [mcpTools]);

  // Load MCP tools when the MCP category is expanded or when searching
  const loadMcpTools = async () => {
    if (mcpTools.length > 0 || mcpLoading) return;
    setMcpLoading(true);
    try {
      // Fetch tool metadata from the API (server-side, avoids bundling
      // Node-only modules like `dns` into the browser bundle).
      const token = useAuthStore.getState().token;
      const res = await fetch("/api/mcp/execute", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const all: Array<{ name: string; description: string; parameters: unknown }> = data.tools || [];
        const curatedNames = new Set(AGENT_TOOL_CATALOG.map((t) => t.name));
        const mcpOnly = all
          .filter((t) => !curatedNames.has(t.name))
          .map((t) => ({
            name: t.name,
            description: t.description,
            category: "mcp" as ToolCategory,
            icon: "⚡",
            parameters: t.parameters as { type: "object"; properties: Record<string, unknown>; required?: string[] },
          }));
        setMcpTools(mcpOnly);
      }
    } catch {
      // silent — MCP tools just won't be available
    } finally {
      setMcpLoading(false);
    }
  };

  // Filtered tools based on search
  const searchLower = toolSearch.toLowerCase().trim();
  const filteredToolsByCat = useMemo(() => {
    if (!searchLower) return toolsByCat;
    const filtered: Record<ToolCategory, AgentToolDef[]> = {
      search: [], content: [], code: [], data: [], communication: [], utility: [], ai: [], mcp: [],
    };
    for (const cat of Object.keys(toolsByCat) as ToolCategory[]) {
      filtered[cat] = toolsByCat[cat].filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          t.description.toLowerCase().includes(searchLower),
      );
    }
    return filtered;
  }, [toolsByCat, searchLower]);

  const totalFiltered = useMemo(
    () => Object.values(filteredToolsByCat).reduce((sum, tools) => sum + tools.length, 0),
    [filteredToolsByCat],
  );

  const toggleTool = (name: string) => {
    setForm((prev) => {
      const has = prev.tools.includes(name);
      return {
        ...prev,
        tools: has ? prev.tools.filter((t) => t !== name) : [...prev.tools, name],
      };
    });
  };

  const toggleCat = (cat: ToolCategory) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
        // Auto-load MCP tools when MCP category is expanded
        if (cat === "mcp") {
          loadMcpTools();
        }
      }
      return next;
    });
  };

  const selectAllInCat = (cat: ToolCategory) => {
    const catTools = toolsByCat[cat].map((t) => t.name);
    setForm((prev) => {
      const hasAll = catTools.every((t) => prev.tools.includes(t));
      const tools = hasAll
        ? prev.tools.filter((t) => !catTools.includes(t))
        : Array.from(new Set([...prev.tools, ...catTools]));
      return { ...prev, tools };
    });
  };

  // ── AI prompt generator ────────────────────────────────────
  const generatePrompt = async () => {
    if (!form.description.trim() || form.description.length < 10) {
      toast.error("اكتب وصف للوكيل الأول (10 أحرف على الأقل)");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/agents/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: form.description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "فشل التوليد");
      }
      const data = await res.json();
      setForm((prev) => ({
        ...prev,
        systemPrompt: data.systemPrompt || prev.systemPrompt,
        tools: data.suggestedTools?.length > 0 ? data.suggestedTools : prev.tools,
        suggestions: data.suggestions?.length > 0 ? data.suggestions : prev.suggestions,
      }));
      toast.success("تم توليد الـ system prompt والأدوات المقترحة");
    } catch (e: unknown) {
      toast.error("فشل توليد البرومبت: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGenerating(false);
    }
  };

  // ── Suggestions management ─────────────────────────────────
  const addSuggestion = () => {
    const s = newSuggestion.trim();
    if (!s) return;
    if (form.suggestions.length >= 10) {
      toast.error("حد أقصى 10 اقتراحات");
      return;
    }
    setForm((prev) => ({ ...prev, suggestions: [...prev.suggestions, s] }));
    setNewSuggestion("");
  };
  const removeSuggestion = (idx: number) => {
    setForm((prev) => ({ ...prev, suggestions: prev.suggestions.filter((_, i) => i !== idx) }));
  };

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error("الاسم مطلوب");
    if (!form.description.trim()) return toast.error("الوصف مطلوب");
    if (!form.systemPrompt.trim()) return toast.error("system prompt مطلوب");
    if (form.tools.length === 0) return toast.error("اختار أداة واحدة على الأقل");
    await onSave(form);
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <ScrollArea className="flex-1 px-1">
        <div className="space-y-6 pb-6">
          {/* ── Basic info ─────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              المعلومات الأساسية
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">الاسم (عربي) *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="وكيل التسويق"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">الاسم (إنجليزي)</label>
                <Input
                  value={form.nameEn}
                  onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                  placeholder="Marketing Agent"
                  className="text-sm"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">الوصف *</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="اكتب وصف قصير للوكيل. هذا الوصف يُستخدم لتوليد الـ system prompt تلقائياً."
                rows={2}
                className="text-sm resize-none"
              />
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">{form.description.length} حرف</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generatePrompt}
                  disabled={generating}
                  className="h-7 gap-1.5 text-xs"
                >
                  {generating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  توليد بـ AI
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">التصنيف</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, category: c.value })}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors",
                      form.category === c.value
                        ? "border-blue-500 bg-blue-500 text-blue-600 dark:text-blue-300"
                        : "border-border bg-muted hover:bg-muted",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ── Icon + Color ───────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              المظهر
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium">الأيقونة</label>
                <div className="grid grid-cols-8 gap-1">
                  {ICON_PRESETS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setForm({ ...form, icon: ic })}
                      className={cn(
                        "aspect-square rounded-md border text-xl flex items-center justify-center transition-all",
                        form.icon === ic
                          ? "border-blue-500 bg-blue-500 scale-105"
                          : "border-border bg-muted hover:bg-muted",
                      )}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">اللون (gradient)</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      title={preset.label}
                      onClick={() => setForm({ ...form, color: preset.value })}
                      className={cn(
                        "aspect-square rounded-md bg-gradient-to-br relative",
                        preset.value,
                        form.color === preset.value
                          ? "ring-2 ring-offset-2 ring-blue-500"
                          : "hover:scale-105",
                      )}
                    >
                      {form.color === preset.value && (
                        <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />
                      )}
                    </button>
                  ))}
                </div>
                {/* Live preview */}
                <div
                  className={cn(
                    "mt-2 flex items-center gap-2 rounded-lg border border-border bg-gradient-to-br p-2.5",
                    form.color,
                  )}
                >
                  <span className="text-2xl">{form.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {form.name || "اسم الوكيل"}
                    </div>
                    <div className="text-[10px] text-blue-800 dark:text-blue-200 truncate">
                      {form.description || "وصف قصير للوكيل"}
                    </div>
                  </div>
                  <Badge className="text-[9px] bg-blue-100 dark:bg-blue-900 text-white border-blue-300 dark:border-blue-800 hover:bg-blue-100 dark:bg-blue-900">
                    {form.tools.length} أداة
                  </Badge>
                </div>
              </div>
            </div>
          </section>

          {/* ── Tools ──────────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                الأدوات ({form.tools.length} مختارة)
              </h3>
              {form.tools.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => setForm({ ...form, tools: [] })}
                >
                  مسح الكل
                </Button>
              )}
            </div>
            {/* Search box */}
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={toolSearch}
                onChange={(e) => {
                  setToolSearch(e.target.value);
                  // Auto-load MCP tools when user starts searching
                  if (e.target.value.length > 0 && mcpTools.length === 0 && !mcpLoading) {
                    loadMcpTools();
                    // Also expand MCP category
                    setExpandedCats((prev) => new Set(prev).add("mcp"));
                  }
                }}
                placeholder="ابحث في 360+ أداة بالاسم أو الوصف..."
                className="h-8 pr-8 text-xs"
              />
              {toolSearch && (
                <button
                  onClick={() => setToolSearch("")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
            </div>
            {toolSearch && (
              <div className="text-[10px] text-muted-foreground px-1">
                {totalFiltered} نتيجة للبحث "{toolSearch}"
              </div>
            )}
            <div className="space-y-2 rounded-lg border border-border bg-muted p-2 max-h-72 overflow-y-auto">
              {(Object.keys(filteredToolsByCat) as ToolCategory[]).map((cat) => {
                const tools = filteredToolsByCat[cat];
                if (tools.length === 0) return null;
                const meta = CATEGORY_META[cat];
                const expanded = expandedCats.has(cat) || (!!toolSearch && tools.length > 0);
                const selectedInCat = tools.filter((t) => form.tools.includes(t.name)).length;
                return (
                  <div key={cat} className="rounded-md background">
                    <button
                      type="button"
                      onClick={() => toggleCat(cat)}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-right hover:bg-muted rounded-md"
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="text-sm">{meta.icon}</span>
                      <span className={cn("text-xs font-semibold", meta.color)}>{meta.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ({selectedInCat}/{tools.length})
                      </span>
                      <span className="ml-auto" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectAllInCat(cat);
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        {selectedInCat === tools.length ? "إلغاء الكل" : "تحديد الكل"}
                      </button>
                    </button>
                    {expanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 px-2 pb-2">
                        {cat === "mcp" && mcpLoading && (
                          <div className="col-span-full flex items-center gap-2 text-[10px] text-muted-foreground py-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            جاري تحميل أدوات MCP (340+)...
                          </div>
                        )}
                        {cat === "mcp" && !mcpLoading && mcpTools.length === 0 && (
                          <div className="col-span-full text-[10px] text-muted-foreground py-2 text-center">
                            لا توجد أدوات MCP متاحة
                          </div>
                        )}
                        {tools.map((tdef) => {
                          const sel = form.tools.includes(tdef.name);
                          return (
                            <button
                              key={tdef.name}
                              type="button"
                              onClick={() => toggleTool(tdef.name)}
                              className={cn(
                                "flex items-start gap-2 rounded-md border p-2 text-right transition-all",
                                sel
                                  ? "border-blue-500 bg-blue-500"
                                  : "border-border bg-background hover:bg-muted",
                              )}
                            >
                              <span className="text-base mt-0.5">{tdef.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-mono font-semibold">
                                    {tdef.name}
                                  </span>
                                  {sel && <Check className="h-3 w-3 text-blue-500" />}
                                </div>
                                <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                                  {tdef.description}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {AGENT_TOOL_CATALOG.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-4">
                  لا توجد أدوات متاحة
                </div>
              )}
            </div>
          </section>

          {/* ── System prompt ──────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                System Prompt *
              </h3>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px]"
                onClick={generatePrompt}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                توليد بالـ AI
              </Button>
            </div>
            <Textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="أنت <اسم الوكيل> — <وصف>. مهاراتك: ... فلسفتك في العمل: ..."
              rows={8}
              className="text-xs font-mono resize-y"
              dir="rtl"
            />
            <div className="text-[10px] text-muted-foreground text-left">
              {form.systemPrompt.length} حرف
            </div>
          </section>

          {/* ── Suggestions ────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              اقتراحات للمستخدم ({form.suggestions.length}/10)
            </h3>
            <div className="flex gap-2">
              <Input
                value={newSuggestion}
                onChange={(e) => setNewSuggestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addSuggestion();
                  }
                }}
                placeholder="اكتب اقتراح واضغط Enter"
                className="text-sm h-8"
              />
              <Button size="sm" onClick={addSuggestion} disabled={!newSuggestion.trim()} className="h-8">
                إضافة
              </Button>
            </div>
            {form.suggestions.length > 0 && (
              <div className="space-y-1">
                {form.suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5"
                  >
                    <span className="text-[10px] text-muted-foreground">{i + 1}.</span>
                    <span className="flex-1 text-xs">{s}</span>
                    <button
                      type="button"
                      onClick={() => removeSuggestion(i)}
                      className="text-[10px] text-muted-foreground hover:text-destructive"
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Visibility ─────────────────────────────────── */}
          <section>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-border"
              />
              <span className="text-xs">وكيل عام (مرئي للجميع)</span>
            </label>
          </section>
        </div>
      </ScrollArea>

      {/* ── Footer actions ─────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-border background px-3 py-2.5">
        <span className="text-[10px] text-muted-foreground">
          {form.tools.length} أداة • {form.systemPrompt.length} حرف في البرومبت
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving} className="h-8 text-xs">
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="h-8 text-xs gap-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {initial ? "حفظ التعديلات" : "إنشاء الوكيل"}
          </Button>
        </div>
      </div>
    </div>
  );
}

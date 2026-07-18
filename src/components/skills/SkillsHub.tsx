"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Brain, Search, FileText, Loader2, BookOpen, Sparkles,
  Copy, Check, Plus, Trash2, Download, X, Github, Link2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Skill {
  name: string;
  description: string;
  version?: string;
  path: string;
  size: number;
  content?: string;
  fullContent?: string;
}

/**
 * SkillsHub — واجهة تصفح وتثبيت المهارات.
 *
 * تقدر من هنا:
 *   - تشوف كل الـ skills المتاحة
 *   - تبحث في الـ skills بكلمة مفتاحية
 *   - تقرا محتوى أي skill كامل
 *   - تثبت skill جديد من URL (GitHub / raw SKILL.md)
 *   - تحذف skill
 *   - الـ Admin Agent بيستخدمهم تلقائياً
 */
export function SkillsHub() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [filtered, setFiltered] = useState<Skill[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, categories: 0, totalSizeKB: 0 });
  const [copied, setCopied] = useState(false);

  // Install dialog state
  const [installOpen, setInstallOpen] = useState(false);
  const [installUrl, setInstallUrl] = useState("");
  const [installName, setInstallName] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState("");

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const [skillsRes, statsRes] = await Promise.all([
        fetch("/api/admin/skills"),
        fetch("/api/admin/skills?stats=true"),
      ]);
      const skillsData = await skillsRes.json();
      const statsData = await statsRes.json();
      setSkills(skillsData.skills || []);
      setFiltered(skillsData.skills || []);
      setStats(statsData);
    } catch {
      toast.error("فشل تحميل المهارات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(skills);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      skills.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    );
  }, [search, skills]);

  const handleSelect = async (skill: Skill) => {
    setSelected({ ...skill, content: "جاري التحميل..." });
    try {
      const res = await fetch(`/api/admin/skills?name=${encodeURIComponent(skill.name)}`);
      const data = await res.json();
      setSelected(data);
    } catch {
      setSelected({ ...skill, content: "خطأ في التحميل" });
    }
  };

  const handleCopy = async () => {
    if (!selected?.fullContent) return;
    try {
      await navigator.clipboard.writeText(selected.fullContent);
      setCopied(true);
      toast.success("تم نسخ المحتوى");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("فشل النسخ");
    }
  };

  const handleInstall = async () => {
    if (!installUrl.trim()) {
      toast.error("اكتب URL الـ skill");
      return;
    }
    setInstalling(true);
    setInstallLog("");
    try {
      const res = await fetch("/api/admin/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "install",
          url: installUrl,
          name: installName || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const count = data.installed?.length ?? 1;
        const names = data.installed?.join(", ") ?? data.name;
        toast.success(`تم تثبيت ${count} skill: ${names}`);
        setInstallLog(data.log || "تم التثبيت بنجاح");
        setInstallUrl("");
        setInstallName("");
        // Refresh skills list
        await fetchSkills();
        // Close dialog after short delay so user sees the log
        setTimeout(() => setInstallOpen(false), 1500);
      } else {
        toast.error("فشل التثبيت: " + (data.error || "خطأ غير معروف"));
        setInstallLog(data.log || "");
      }
    } catch (e: any) {
      toast.error("خطأ: " + e.message);
    } finally {
      setInstalling(false);
    }
  };

  const handleDelete = async (skillName: string) => {
    if (!confirm(`هل أنت متأكد من حذف skill "${skillName}"؟`)) return;
    try {
      const res = await fetch("/api/admin/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", name: skillName }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("تم حذف الـ skill");
        if (selected?.name === skillName) setSelected(null);
        fetchSkills();
      } else {
        toast.error("فشل الحذف: " + (data.error || ""));
      }
    } catch (e: any) {
      toast.error("خطأ: " + e.message);
    }
  };

  const installExamples = [
    { label: "ريpo skills كامل", url: "https://github.com/coreyhaines31/marketingskills", icon: Github },
    { label: "skill واحدة من GitHub", url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/cro", icon: Github },
    { label: "ملف SKILL.md مباشر", url: "https://raw.githubusercontent.com/coreyhaines31/marketingskills/main/skills/cro/SKILL.md", icon: Link2 },
  ];

  return (
    <div className="flex h-full" dir="rtl">
      {/* Sidebar - skills list */}
      <div className="w-72 shrink-0 border-l border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold">المهارات</h3>
              <p className="text-[10px] text-muted-foreground">{stats.total} skill متاح</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={() => setInstallOpen(true)}
              title="تثبيت skill جديد"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في المهارات..."
              className="h-8 pr-8 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {search ? `مفيش مهارات تطابق "${search}"` : "مفيش مهارات. ثبت واحدة من فوق"}
              </div>
            ) : (
              filtered.map((skill) => (
                <div
                  key={skill.name}
                  className={cn(
                    "group relative rounded-lg px-2.5 py-2 hover:bg-accent transition-colors",
                    selected?.name === skill.name && "bg-accent"
                  )}
                >
                  <button
                    onClick={() => handleSelect(skill)}
                    className="w-full text-right"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Sparkles className="h-3 w-3 text-blue-500 shrink-0" />
                      <code className="text-xs font-mono font-semibold group-hover:text-blue-500 transition-colors">
                        {skill.name}
                      </code>
                      {skill.version && (
                        <Badge variant="outline" className="text-[8px] h-3 px-1 ml-auto font-mono">
                          v{skill.version}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight mr-4">
                      {skill.description.slice(0, 100)}...
                    </p>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(skill.name); }}
                    className="absolute left-1 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 hover:bg-blue-500 text-blue-500"
                    title="حذف"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main - skill content */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-500/10 mb-4">
                <BookOpen className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-base font-bold mb-1">مكتبة المهارات</h3>
              <p className="text-xs text-muted-foreground mb-4">
                اختر skill من القائمة لتصفح محتواها. الـ Admin Agent بيستخدم المهارات دي تلقائياً لما تسأله سؤال تسويقي.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center mb-4">
                <div className="rounded-lg border border-border bg-muted p-2">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-300">{stats.total}</div>
                  <div className="text-[10px] text-muted-foreground">مهارة</div>
                </div>
                <div className="rounded-lg border border-border bg-muted p-2">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-300">{Math.round(stats.totalSizeKB)}KB</div>
                  <div className="text-[10px] text-muted-foreground">حجم المعرفة</div>
                </div>
                <div className="rounded-lg border border-border bg-muted p-2">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-300">AUTO</div>
                  <div className="text-[10px] text-muted-foreground">تحميل تلقائي</div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setInstallOpen(true)}
                className="bg-gradient-to-br from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                تثبيت skill من URL
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 bg-muted">
              <FileText className="h-4 w-4 text-blue-500 shrink-0" />
              <code className="text-sm font-mono font-semibold">{selected.name}</code>
              {selected.version && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">v{selected.version}</Badge>
              )}
              <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{(selected.size / 1024).toFixed(1)}KB</Badge>
              <div className="mr-auto flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] hover:bg-accent transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-blue-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "اتنسخ" : "نسخ"}
                </button>
                <button
                  onClick={() => handleDelete(selected.name)}
                  className="flex items-center gap-1 rounded-md border border-blue-500 px-2 py-1 text-[10px] hover:bg-blue-500 text-blue-600 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  حذف
                </button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4">
                <p className="text-xs text-muted-foreground mb-3 italic">{selected.description}</p>
                <pre className="text-[11px] font-mono bg-muted rounded-md p-3 whitespace-pre-wrap leading-relaxed" dir="ltr">
                  {selected.content}
                </pre>
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* Install Dialog */}
      {installOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 " onClick={() => !installing && setInstallOpen(false)}>
          <div
            className="w-[90%] max-w-lg rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                <Download className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold">تثبيت skill جديد</h3>
                <p className="text-[10px] text-muted-foreground">من GitHub أو raw SKILL.md — بيتثبت ويستخدم فوراً</p>
              </div>
              <button
                onClick={() => !installing && setInstallOpen(false)}
                className="rounded-md p-1 hover:bg-accent"
                disabled={installing}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold mb-1.5 block">URL الـ skill *</label>
                <Input
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                  placeholder="https://github.com/user/repo أو رابط SKILL.md"
                  className="h-9 text-sm font-mono"
                  dir="ltr"
                  disabled={installing}
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1.5 block">اسم الـ skill (اختياري)</label>
                <Input
                  value={installName}
                  onChange={(e) => setInstallName(e.target.value)}
                  placeholder="auto-detected"
                  className="h-9 text-sm font-mono"
                  dir="ltr"
                  disabled={installing}
                />
              </div>

              {/* Examples */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">أمثلة:</p>
                <div className="space-y-1">
                  {installExamples.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => { setInstallUrl(ex.url); }}
                      disabled={installing}
                      className="flex items-center gap-2 w-full rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs hover:bg-accent transition-colors text-right disabled:opacity-50"
                    >
                      <ex.icon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium shrink-0">{ex.label}</span>
                      <code className="text-[9px] text-muted-foreground font-mono truncate">{ex.url}</code>
                    </button>
                  ))}
                </div>
              </div>

              {/* Install log */}
              {installLog && (
                <div>
                  <p className="text-[10px] font-semibold mb-1">السجل:</p>
                  <pre className="text-[10px] font-mono muted rounded-md p-2 max-h-32 overflow-y-auto whitespace-pre-wrap" dir="ltr">
                    {installLog}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 border-t border-border px-4 py-3">
              <Button
                onClick={handleInstall}
                disabled={installing || !installUrl.trim()}
                className="bg-gradient-to-br from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700"
              >
                {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {installing ? "جاري التثبيت..." : "تثبيت واستخدام فوراً"}
              </Button>
              <Button variant="outline" onClick={() => setInstallOpen(false)} disabled={installing}>
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

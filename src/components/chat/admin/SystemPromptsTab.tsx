'use client';

// ─── System Prompts Tab ─────────────────────────────────────────
// تبويب إدارة برومبتس النظام — عرض وتعديل وتجاوز البرومبتس الافتراضية
// v2: شامل لكل البرومبتس + متين ضد الأخطاء + فئة الوكلاء

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  FileText,
  RotateCcw,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Bot,
  Sparkles,
  Cpu,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────

interface SystemPromptItem {
  key: string;
  category: string;
  label: string;
  labelEn: string;
  description: string;
  sourceFile: string;
  sourceKey: string;
  value: string;
  originalValue: string;
  isActive: boolean;
  isOverridden: boolean;
  updatedAt: string | null;
}

interface SystemPromptsTabProps {
  token: string | null;
}

// ─── Category Config ────────────────────────────────────────────

const categoryConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  model: { label: 'نماذج Chat', icon: Bot, color: 'text-blue-500' },
  feature: { label: 'ميزات', icon: Sparkles, color: 'text-blue-500' },
  agent: { label: 'وكلاء', icon: Cpu, color: 'text-blue-500' },
};

const categoryFilters = [
  { key: 'all', label: 'كل البرومبتس' },
  { key: 'model', label: 'نماذج Chat' },
  { key: 'feature', label: 'ميزات' },
  { key: 'agent', label: 'وكلاء' },
];

// ─── Component ──────────────────────────────────────────────────

function SystemPromptsTab({ token }: SystemPromptsTabProps) {
  const [prompts, setPrompts] = useState<SystemPromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SystemPromptItem | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset confirmation
  const [resetKey, setResetKey] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // ── Fetch Prompts ──
  const fetchPrompts = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setWarning(null);
    fetch('/api/admin/system-prompts', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) {
          return r.json().then(data => {
            throw new Error(data.error || `خطأ HTTP: ${r.status}`);
          });
        }
        return r.json();
      })
      .then((data) => {
        if (data.prompts && Array.isArray(data.prompts)) {
          setPrompts(data.prompts);
          if (data.warning) {
            setWarning(data.warning);
          }
        } else {
          setError('لم يتم العثور على برومبتس');
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'خطأ في تحميل برومبتس النظام';
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  // ── Filter Prompts ──
  const filteredPrompts = prompts.filter((p) => {
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesSearch =
      !searchQuery ||
      p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.labelEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.value.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // ── Toggle Expanded ──
  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Open Edit Dialog ──
  const openEdit = (prompt: SystemPromptItem) => {
    setEditingPrompt(prompt);
    setEditValue(prompt.value);
    setEditDialogOpen(true);
  };

  // ── Save Edit ──
  const handleSave = async () => {
    if (!token || !editingPrompt) return;
    if (editValue.trim() === editingPrompt.originalValue) {
      // إذا القيمة مطابقة للافتراضي، احذف التجاوز
      try {
        setSaving(true);
        const res = await fetch('/api/admin/system-prompts', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ key: editingPrompt.key }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'حدث خطأ');
        toast.success('تم إعادة التعيين تلقائياً — القيمة مطابقة للافتراضي');
        setEditDialogOpen(false);
        fetchPrompts();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'خطأ في الحفظ');
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/system-prompts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          key: editingPrompt.key,
          value: editValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم حفظ البرومبت بنجاح');
      setEditDialogOpen(false);
      fetchPrompts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  // ── Reset to Default ──
  const handleReset = async (key: string) => {
    if (!token) return;
    setResetting(true);
    try {
      const res = await fetch('/api/admin/system-prompts', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم إعادة التعيين للافتراضي');
      setResetKey(null);
      fetchPrompts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في إعادة التعيين');
    } finally {
      setResetting(false);
    }
  };

  // ── Toggle Active ──
  const handleToggleActive = async (prompt: SystemPromptItem) => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/system-prompts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          key: prompt.key,
          value: prompt.value,
          isActive: !prompt.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success(prompt.isActive ? 'تم تعطيل البرومبت' : 'تم تفعيل البرومبت');
      fetchPrompts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في التحديث');
    }
  };

  // ── Stats ──
  const modelCount = prompts.filter((p) => p.category === 'model').length;
  const featureCount = prompts.filter((p) => p.category === 'feature').length;
  const agentCount = prompts.filter((p) => p.category === 'agent').length;
  const overriddenCount = prompts.filter((p) => p.isOverridden).length;

  // ── Loading State ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="size-6 animate-spin text-blue-500" />
      </div>
    );
  }

  // ── Error State ──
  if (error && prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3" dir="rtl">
        <AlertCircle className="size-8 text-red-500" />
        <p className="text-sm text-red-500 text-center">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchPrompts}>
          <RefreshCw className="size-3.5 ml-1" />
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── Warning Banner ── */}
      {warning && (
        <div className="flex items-center gap-2 rounded-md border border-blue-500 bg-blue-500 p-3 text-blue-600 dark:text-blue-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="text-xs">{warning}</span>
        </div>
      )}

      {/* ── Header Stats ── */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="border-border bg-gradient-to-bl from-blue-500 to-transparent">
          <CardContent className="p-2.5 text-center">
            <div className="text-lg font-bold text-blue-500">{modelCount}</div>
            <div className="text-[10px] text-muted-foreground">نماذج Chat</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-gradient-to-bl from-blue-500 to-transparent">
          <CardContent className="p-2.5 text-center">
            <div className="text-lg font-bold text-blue-500">{featureCount}</div>
            <div className="text-[10px] text-muted-foreground">ميزات</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-gradient-to-bl from-blue-500 to-transparent">
          <CardContent className="p-2.5 text-center">
            <div className="text-lg font-bold text-blue-500">{agentCount}</div>
            <div className="text-[10px] text-muted-foreground">وكلاء</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-gradient-to-bl from-blue-500 to-transparent">
          <CardContent className="p-2.5 text-center">
            <div className="text-lg font-bold text-blue-500">{overriddenCount}</div>
            <div className="text-[10px] text-muted-foreground">معدّل</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Search & Filter ── */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="بحث في البرومبتس..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categoryFilters.map((filter) => (
            <Button
              key={filter.key}
              variant={categoryFilter === filter.key ? 'default' : 'outline'}
              size="sm"
              className={
                categoryFilter === filter.key
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'text-xs'
              }
              onClick={() => setCategoryFilter(filter.key)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Prompts List ── */}
      <ScrollArea className="max-h-[45vh]">
        <div className="space-y-3 pr-1">
          {filteredPrompts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <FileText className="size-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">لا توجد نتائج</p>
            </div>
          ) : (
            filteredPrompts.map((prompt) => {
              const catConfig = categoryConfig[prompt.category] || categoryConfig.model;
              const isExpanded = expandedKeys.has(prompt.key);
              const CatIcon = catConfig.icon;

              return (
                <Card
                  key={prompt.key}
                  className={`border-border transition-all ${
                    !prompt.isActive ? 'opacity-50' : ''
                  } ${prompt.isOverridden ? 'border-blue-500' : ''}`}
                >
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <CatIcon className={`size-4 mt-0.5 shrink-0 ${catConfig.color}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-sm font-semibold leading-tight">
                              {prompt.label}
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 shrink-0"
                            >
                              {prompt.labelEn}
                            </Badge>
                            {prompt.isOverridden ? (
                              <Badge className="text-[9px] px-1.5 py-0 bg-blue-500 text-blue-600 dark:text-blue-400 border-blue-500 shrink-0">
                                معدّل
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 text-muted-foreground shrink-0"
                              >
                                افتراضي
                              </Badge>
                            )}
                            {!prompt.isActive && (
                              <Badge className="text-[9px] px-1.5 py-0 bg-red-500 text-red-600 dark:text-red-400 border-red-500 shrink-0">
                                معطّل
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 truncate">
                            {prompt.key} • {prompt.sourceFile}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => toggleExpanded(prompt.key)}
                          title={isExpanded ? 'طي' : 'توسيع'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => openEdit(prompt)}
                          title="تعديل"
                        >
                          <Edit3 className="size-3.5 text-blue-500" />
                        </Button>
                        {prompt.isOverridden && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setResetKey(prompt.key)}
                            title="إعادة تعيين"
                          >
                            <RotateCcw className="size-3.5 text-blue-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => handleToggleActive(prompt)}
                          title={prompt.isActive ? 'تعطيل' : 'تفعيل'}
                        >
                          {prompt.isActive ? (
                            <Eye className="size-3.5 text-blue-500" />
                          ) : (
                            <EyeOff className="size-3.5 text-red-500" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 pt-0">
                    {prompt.description && (
                      <p className="text-[11px] text-muted-foreground mb-2">
                        {prompt.description}
                      </p>
                    )}
                    <div
                      className={`text-[11px] text-foreground muted rounded-md p-2 font-mono leading-relaxed ${
                        !isExpanded ? 'max-h-16 overflow-hidden' : ''
                      }`}
                      dir="rtl"
                    >
                      {prompt.value}
                    </div>
                    {!isExpanded && prompt.value.length > 150 && (
                      <button
                        onClick={() => toggleExpanded(prompt.key)}
                        className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 hover:underline"
                      >
                        عرض المزيد...
                      </button>
                    )}
                    {prompt.isOverridden && prompt.updatedAt && (
                      <div className="text-[9px] text-muted-foreground mt-1.5">
                        آخر تعديل: {new Date(prompt.updatedAt).toLocaleDateString('ar-EG')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* ── Edit Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden" dir="rtl">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Edit3 className="size-4 text-blue-500" />
              تعديل البرومبت
            </DialogTitle>
            {editingPrompt && (
              <div className="text-sm text-muted-foreground mt-1">
                {editingPrompt.label} ({editingPrompt.labelEn})
              </div>
            )}
            {editingPrompt && (
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <FileText className="size-3" />
                {editingPrompt.sourceFile} • {editingPrompt.sourceKey}
              </div>
            )}
          </DialogHeader>
          <div className="px-6 pb-2 space-y-3 overflow-y-auto max-h-[55vh]">
            {/* Description */}
            {editingPrompt && editingPrompt.description && (
              <div className="rounded-md border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3">
                <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mb-1">
                  📋 وصف البرومبت
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {editingPrompt.description}
                </div>
              </div>
            )}

            {/* Original value for reference */}
            {editingPrompt && editingPrompt.isOverridden && (
              <div className="rounded-md border border-blue-500 bg-blue-500 p-3">
                <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  القيمة الافتراضية (للمقارنة)
                </div>
                <div className="text-[10px] text-muted-foreground font-mono max-h-24 overflow-y-auto leading-relaxed">
                  {editingPrompt.originalValue}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-medium mb-1.5">البرومبت الجديد</div>
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="min-h-[200px] font-mono text-sm leading-relaxed resize-y"
                dir="rtl"
                placeholder="أدخل البرومبت الجديد..."
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">
                  {editValue.length} حرف
                </span>
                {editingPrompt && (
                  <button
                    onClick={() => setEditValue(editingPrompt.originalValue)}
                    className="text-[10px] text-blue-500 hover:underline"
                  >
                    استعادة الافتراضي
                  </button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 pb-4 pt-2 gap-2 flex-row-reverse">
            <Button
              onClick={handleSave}
              disabled={saving || editValue.trim() === ''}
              className="bg-gradient-to-l from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin ml-1" />
              ) : null}
              {saving ? 'جاري الحفظ...' : 'حفظ البرومبت'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={saving}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset Confirmation Dialog ── */}
      <Dialog open={!!resetKey} onOpenChange={() => setResetKey(null)}>
        <DialogContent className="max-w-sm p-0 overflow-hidden" dir="rtl">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="size-4 text-blue-500" />
              إعادة تعيين البرومبت
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-2">
            <p className="text-sm text-muted-foreground">
              هل أنت متأكد من إعادة التعيين للافتراضي؟ سيتم حذف التعديلات المحفوظة.
            </p>
          </div>
          <DialogFooter className="px-6 pb-4 pt-2 gap-2 flex-row-reverse">
            <Button
              variant="destructive"
              onClick={() => resetKey && handleReset(resetKey)}
              disabled={resetting}
            >
              {resetting ? (
                <Loader2 className="size-4 animate-spin ml-1" />
              ) : null}
              {resetting ? 'جاري الحذف...' : 'نعم، إعادة تعيين'}
            </Button>
            <Button variant="outline" onClick={() => setResetKey(null)} disabled={resetting}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SystemPromptsTab;

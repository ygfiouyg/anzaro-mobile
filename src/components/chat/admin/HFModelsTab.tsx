'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  Trash2,
  CheckCircle,
  Cpu,
  Search,
  Ban,
  Play,
  RefreshCw,
  Video,
  Image as ImageIcon,
  FileText,
  ArrowUpFromLine,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import type { HFModelData, HFTestResult } from './types';

type ModelCategory = 'chat' | 'image' | 'video' | 'document';

interface ModelsData {
  chat: { models: HFModelData[]; total: number };
  image: { models: HFModelData[]; total: number };
  video: { models: HFModelData[]; total: number };
  document: { models: HFModelData[]; total: number };
  disabledModels: string[];
}

interface HFModelsTabProps {
  token: string | null;
}

function HFModelsTab({ token }: HFModelsTabProps) {
  const [models, setModels] = useState<ModelsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | ModelCategory>('all');
  const [search, setSearch] = useState('');
  const [testResults, setTestResults] = useState<Record<string, HFTestResult>>({});
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [bulkTesting, setBulkTesting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [addedHfModelIds, setAddedHfModelIds] = useState<Set<string>>(new Set());
  const [addingModelId, setAddingModelId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchModels = useCallback(() => {
    if (!token) return;
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    fetch('/api/admin/hf-models', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        // Ensure document field exists (backward compat)
        if (!data.document) {
          data.document = { models: [], total: 0 };
        }
        setModels(data);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          toast.error('خطأ في تحميل النماذج');
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Fetch promoted HF model IDs
  const fetchAddedModels = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/custom-models', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.addedHfModelIds) {
        setAddedHfModelIds(new Set(data.addedHfModelIds));
      }
    } catch {
      // silent
    }
  }, [token]);

  useEffect(() => {
    fetchModels();
    fetchAddedModels();
    return () => abortRef.current?.abort();
  }, [fetchModels, fetchAddedModels]);

  const handleTestModel = async (type: ModelCategory, modelId: string) => {
    if (!token) return;
    setTestingModel(modelId);
    try {
      const res = await fetch('/api/admin/hf-models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'test', type, modelId }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [modelId]: { modelId, ...data } }));
      if (data.success) {
        toast.success(`${modelId}: متاح (${data.responseTimeMs}ms)`);
      } else {
        toast.error(`${modelId}: ${data.error || data.status}`);
      }
    } catch {
      setTestResults((prev) => ({ ...prev, [modelId]: { modelId, success: false, status: 'failed', error: 'خطأ في الاتصال' } }));
    } finally {
      setTestingModel(null);
    }
  };

  const handleAddToMyModels = async (modelId: string, modelName: string | undefined, modelCategory: ModelCategory) => {
    if (!token) { toast.error('لا يوجد رمز مصادقة'); return; }
    if (addedHfModelIds.has(modelId)) {
      toast.info('هذا النموذج مضاف بالفعل');
      return;
    }
    setAddingModelId(modelId);
    try {
      const res = await fetch('/api/admin/custom-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hfModelId: modelId, hfModelName: modelName || modelId, category: modelCategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      const categoryLabels: Record<string, string> = { chat: 'الشات', image: 'الصور', video: 'الفيديو', document: 'المستندات' };
      if (data.validationStatus === 'failed' && data.warning) {
        toast.warning(data.warning);
      } else if (data.validationStatus === 'warning' && data.warning) {
        toast.success(`تم إضافة "${modelName || modelId}" إلى نماذج ${categoryLabels[modelCategory] || modelCategory}`);
        toast.info(data.warning);
      } else {
        toast.success(`تم إضافة "${modelName || modelId}" إلى نماذج ${categoryLabels[modelCategory] || modelCategory}`);
      }
      setAddedHfModelIds(prev => new Set([...prev, modelId]));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'حدث خطأ';
      toast.error(`فشل الإضافة: ${errMsg}`);
    } finally {
      setAddingModelId(null);
    }
  };

  const handleToggleModel = async (modelId: string, currentlyDisabled: boolean) => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/hf-models', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: currentlyDisabled ? 'enable' : 'disable', modelId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(currentlyDisabled ? 'تم تفعيل النموذج' : 'تم تعطيل النموذج');
        fetchModels();
      }
    } catch {
      toast.error('خطأ في تحديث حالة النموذج');
    }
  };

  const handleBulkTest = async () => {
    if (!token || !models) return;
    const visibleModels = getFilteredModels();
    setBulkTesting(true);
    setBulkProgress(0);
    setBulkTotal(visibleModels.length);

    try {
      // Test each model with its correct type (not just 'chat')
      for (let i = 0; i < visibleModels.length; i++) {
        const model = visibleModels[i];
        const modelType = getModelType(model);
        setBulkProgress(i + 1);
        try {
          const res = await fetch('/api/admin/hf-models', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ action: 'test', type: modelType, modelId: model.id }),
          });
          const data = await res.json();
          setTestResults((prev) => ({ ...prev, [model.id]: { modelId: model.id, ...data } }));
        } catch {
          setTestResults((prev) => ({ ...prev, [model.id]: { modelId: model.id, success: false, status: 'failed', error: 'خطأ' } }));
        }
        // Small delay between tests
        await new Promise((r) => setTimeout(r, 300));
      }
      toast.success('تم اختبار جميع النماذج');
    } finally {
      setBulkTesting(false);
    }
  };

  const handleEnableAllDisabled = async () => {
    if (!token || !models) return;
    const ids = models.disabledModels;
    let enabled = 0;
    for (const id of ids) {
      try {
        const res = await fetch('/api/admin/hf-models', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'enable', modelId: id }),
        });
        const data = await res.json();
        if (data.success) enabled++;
      } catch {
        // skip
      }
    }
    toast.success(`تم تفعيل ${enabled} من ${ids.length} نموذج معطل`);
    fetchModels();
  };

  const getFilteredModels = (): HFModelData[] => {
    if (!models) return [];
    let allModels: HFModelData[] = [];

    if (filter === 'all' || filter === 'chat') {
      allModels = [...allModels, ...models.chat.models];
    }
    if (filter === 'all' || filter === 'image') {
      allModels = [...allModels, ...models.image.models];
    }
    if (filter === 'all' || filter === 'video') {
      allModels = [...allModels, ...models.video.models];
    }
    if (filter === 'all' || filter === 'document') {
      allModels = [...allModels, ...models.document.models];
    }

    if (search) {
      const q = search.toLowerCase();
      allModels = allModels.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.shortName && m.shortName.toLowerCase().includes(q)) ||
          (m.category && m.category.toLowerCase().includes(q))
      );
    }

    return allModels;
  };

  const getModelType = (model: HFModelData): ModelCategory => {
    if (models?.chat.models.some((m) => m.id === model.id)) return 'chat';
    if (models?.image.models.some((m) => m.id === model.id)) return 'image';
    if (models?.video.models.some((m) => m.id === model.id)) return 'video';
    if (models?.document.models.some((m) => m.id === model.id)) return 'document';
    return 'chat'; // fallback
  };

  const getStatusIcon = (model: HFModelData) => {
    const result = testResults[model.id];
    if (testingModel === model.id) {
      return <div className="animate-spin rounded-full size-3.5 border-2 border-blue-500 border-t-transparent" />;
    }
    if (result) {
      if (result.success) return <span className="text-blue-500 text-xs">✅</span>;
      if (result.status === 'loading') return <span className="text-blue-500 text-xs">⏳</span>;
      if (result.status === 'rate-limited') return <span className="text-blue-500 text-xs">⚠️</span>;
      if (result.status === 'sleeping') return <span className="text-blue-500 text-xs">😴</span>;
      if (result.status === 'timeout') return <span className="text-blue-500 text-xs">⏱️</span>;
      if (result.status === 'not-deployed') return <span className="text-gray-500 text-xs">🚷</span>;
      if (result.status === 'gated') return <span className="text-blue-600 text-xs">🔒</span>;
      return <span className="text-red-500 text-xs">❌</span>;
    }
    if (model.disabled) return <span className="text-red-500 text-xs">🚫</span>;
    if (model.health) {
      if (model.health.rateLimited) return <span className="text-blue-500 text-xs">⚠️</span>;
      if (model.health.loading) return <span className="text-blue-500 text-xs">⏳</span>;
      if (model.health.unavailable) return <span className="text-red-500 text-xs">❌</span>;
      if (model.health.usable) return <span className="text-blue-500 text-xs">✅</span>;
    }
    return <span className="text-muted-foreground text-xs">—</span>;
  };

  const getTypeBadge = (model: HFModelData) => {
    const modelType = getModelType(model);
    switch (modelType) {
      case 'chat':
        return <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">شات</Badge>;
      case 'image':
        return <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-blue-500 text-blue-600 dark:text-blue-400">صور</Badge>;
      case 'video':
        return <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-blue-500 text-blue-600 dark:text-blue-400">فيديو</Badge>;
      case 'document':
        return <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-blue-500 text-blue-600 dark:text-blue-400">مستندات</Badge>;
    }
  };

  const getServiceTypeBadge = (model: HFModelData) => {
    const t = model.type;
    if (t === 'inference') return <Badge variant="outline" className="text-[7px] px-1 py-0">Inference</Badge>;
    if (t === 'gradio') return <Badge variant="outline" className="text-[7px] px-1 py-0">Gradio</Badge>;
    if (t === 'zhipuai') return <Badge variant="outline" className="text-[7px] px-1 py-0">ZhipuAI</Badge>;
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const filteredModels = getFilteredModels();
  const chatCount = models?.chat.total ?? 0;
  const imageCount = models?.image.total ?? 0;
  const videoCount = models?.video.total ?? 0;
  const documentCount = models?.document.total ?? 0;
  const disabledCount = models?.disabledModels.length ?? 0;
  const chatAvailable = models?.chat.models.filter((m) => !m.disabled && m.health?.usable).length ?? 0;
  const imageAvailable = models?.image.models.filter((m) => !m.disabled && m.health?.usable).length ?? 0;
  const videoAvailable = models?.video.models.filter((m) => !m.disabled && m.health?.usable).length ?? 0;
  const documentAvailable = models?.document.models.filter((m) => !m.disabled).length ?? 0;
  const totalCount = chatCount + imageCount + videoCount + documentCount;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <MessageSquare className="size-5 mx-auto text-blue-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">نماذج الشات</p>
            <p className="text-xl font-bold">{chatCount}</p>
            <p className="text-[9px] text-blue-500">✅ {chatAvailable} ❌ {chatCount - chatAvailable}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <ImageIcon className="size-5 mx-auto text-blue-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">نماذج الصور</p>
            <p className="text-xl font-bold">{imageCount}</p>
            <p className="text-[9px] text-blue-500">✅ {imageAvailable} ❌ {imageCount - imageAvailable}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <Video className="size-5 mx-auto text-blue-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">نماذج الفيديو</p>
            <p className="text-xl font-bold">{videoCount}</p>
            <p className="text-[9px] text-blue-500">✅ {videoAvailable} ❌ {videoCount - videoAvailable}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <FileText className="size-5 mx-auto text-blue-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">نماذج المستندات</p>
            <p className="text-xl font-bold">{documentCount}</p>
            <p className="text-[9px] text-blue-500">✅ {documentAvailable} ❌ {documentCount - documentAvailable}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <Ban className="size-5 mx-auto text-red-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">نماذج معطلة</p>
            <p className="text-xl font-bold text-red-500">{disabledCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'bg-blue-500 hover:bg-blue-600 text-[10px] h-7' : 'text-[10px] h-7'}
          >
            الكل ({totalCount})
          </Button>
          <Button
            variant={filter === 'chat' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('chat')}
            className={filter === 'chat' ? 'bg-blue-500 hover:bg-blue-600 text-[10px] h-7' : 'text-[10px] h-7'}
          >
            شات ({chatCount})
          </Button>
          <Button
            variant={filter === 'image' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('image')}
            className={filter === 'image' ? 'bg-blue-500 hover:bg-blue-600 text-[10px] h-7' : 'text-[10px] h-7'}
          >
            صور ({imageCount})
          </Button>
          <Button
            variant={filter === 'video' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('video')}
            className={filter === 'video' ? 'bg-blue-500 hover:bg-blue-600 text-[10px] h-7' : 'text-[10px] h-7'}
          >
            فيديو ({videoCount})
          </Button>
          <Button
            variant={filter === 'document' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('document')}
            className={filter === 'document' ? 'bg-blue-500 hover:bg-blue-600 text-[10px] h-7' : 'text-[10px] h-7'}
          >
            مستندات ({documentCount})
          </Button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو المعرف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-8 h-7 text-xs"
          />
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleBulkTest}
          disabled={bulkTesting || filteredModels.length === 0}
          className="text-[10px] h-7"
        >
          {bulkTesting ? (
            <>
              <div className="animate-spin rounded-full size-3 border-2 border-blue-500 border-t-transparent ml-1" />
              اختبار الكل ({bulkProgress}/{bulkTotal})
            </>
          ) : (
            <>
              <Play className="size-3 ml-1" />
              اختبار الكل
            </>
          )}
        </Button>
        {disabledCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleEnableAllDisabled}
            disabled={bulkTesting}
            className="text-[10px] h-7 text-blue-600 hover:text-blue-700"
          >
            <CheckCircle className="size-3 ml-1" />
            تفعيل المعطلين ({disabledCount})
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={fetchModels} className="size-7" title="تحديث">
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {/* Bulk Progress */}
      {bulkTesting && (
        <div className="space-y-1">
          <Progress value={(bulkProgress / bulkTotal) * 100} className="h-1.5 [&>div]:bg-blue-500" />
          <p className="text-[9px] text-muted-foreground text-center">
            جارٍ الاختبار: {bulkProgress} من {bulkTotal} نموذج
          </p>
        </div>
      )}

      {/* Model List */}
      <ScrollArea className="max-h-[450px]">
        {filteredModels.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Cpu className="size-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">لا توجد نماذج</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredModels.map((model) => {
              const modelType = getModelType(model);
              const result = testResults[model.id];
              return (
                <div
                  key={model.id}
                  className={`flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted transition-colors ${
                    model.disabled ? 'opacity-50' : ''
                  }`}
                >
                  {/* Status */}
                  <div className="flex-shrink-0 w-5 text-center">
                    {getStatusIcon(model)}
                  </div>

                  {/* Name & ID */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium truncate max-w-[150px]">
                        {model.shortName || model.name || model.id}
                      </span>
                      {getTypeBadge(model)}
                      {model.category && modelType === 'chat' && (
                        <Badge variant="outline" className="text-[7px] px-1 py-0">{model.category}</Badge>
                      )}
                      {getServiceTypeBadge(model)}
                      {model.size && (
                        <Badge variant="secondary" className="text-[7px] px-1 py-0">{model.size}</Badge>
                      )}
                      {model.disabled && (
                        <Badge variant="destructive" className="text-[7px] px-1 py-0">معطل</Badge>
                      )}
                    </div>
                    <code className="text-[9px] text-muted-foreground font-mono truncate block" dir="ltr">
                      {model.id}
                    </code>
                    {/* Test result info */}
                    {result && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {result.responseTimeMs !== undefined && (
                          <span className="text-[8px] text-muted-foreground">
                            ⏱ {result.responseTimeMs}ms
                          </span>
                        )}
                        {result.error && (
                          <span className="text-[8px] text-red-500 truncate max-w-[200px]">
                            {result.error}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Health info from LB */}
                    {!result && model.health && model.health.avgResponseMs > 0 && (
                      <span className="text-[8px] text-muted-foreground">
                        ⏱ ~{model.health.avgResponseMs}ms | ✅ {model.health.successCount} ❌ {model.health.failCount}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {/* Add to my models button */}
                    {addedHfModelIds.has(model.id) ? (
                      <Badge className="text-[7px] px-1 py-0 bg-blue-500 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                        <Check className="size-2 ml-0.5" />
                        تمت
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-blue-600 hover:text-blue-700 hover:bg-blue-500"
                        onClick={() => handleAddToMyModels(model.id, model.shortName || model.name, modelType)}
                        disabled={addingModelId === model.id}
                        title="أضف للنماذج"
                      >
                        {addingModelId === model.id ? (
                          <span className="animate-spin text-[10px]">⏳</span>
                        ) : (
                          <ArrowUpFromLine className="size-3" />
                        )}
                      </Button>
                    )}
                    {/* Test button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-blue-500 hover:text-blue-600"
                      onClick={() => handleTestModel(modelType, model.id)}
                      disabled={testingModel === model.id}
                      title="اختبار"
                    >
                      <Play className="size-3" />
                    </Button>
                    {/* Enable/Disable toggle */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`size-6 ${model.disabled ? 'text-blue-500' : 'text-red-500 hover:text-red-600'}`}
                      onClick={() => handleToggleModel(model.id, model.disabled)}
                      title={model.disabled ? 'تفعيل' : 'تعطيل'}
                    >
                      {model.disabled ? (
                        <CheckCircle className="size-3" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default HFModelsTab;

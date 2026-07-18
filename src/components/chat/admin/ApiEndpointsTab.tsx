'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  Trash2,
  CheckCircle,
  XCircle,
  Database,
  Wifi,
  Zap,
  Globe,
  Play,
  RefreshCw,
  Clock,
  Plus,
  ChevronDown,
  ChevronUp,
  Check,
  ArrowUpFromLine,
} from 'lucide-react';
import { toast } from 'sonner';

interface ApiEndpointsTabProps {
  token: string | null;
}

interface AggregatorEndpoint {
  id: string;
  name: string;
  provider: string;
  category: string;
  baseUrl: string;
  modelId: string | null;
  isAvailable: boolean;
  isFree: boolean;
  priority: number;
  avgResponseMs: number | null;
  successRate: number | null;
  lastValidatedAt: string | null;
  consecutiveFails: number;
  lastError: string | null;
  updatedAt: string;
}

interface AggregatorRecentJob {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  endpointsFound: number;
  endpointsValidated: number;
  errors: number;
  durationMs: number | null;
}

interface AggregatorStatus {
  scheduler: {
    isRunning: boolean;
    lastRun: string | null;
    nextRun: string | null;
    intervalMs: number;
  };
  pool: {
    totalEndpoints: number;
    availableEndpoints: number;
    byCategory: Record<string, number>;
    byProvider: Record<string, number>;
    lastUpdate: string | null;
  };
  recentJobs: AggregatorRecentJob[];
  endpoints: AggregatorEndpoint[];
}

function ApiEndpointsTab({ token }: ApiEndpointsTabProps) {
  const [status, setStatus] = useState<AggregatorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterAvailability, setFilterAvailability] = useState<'all' | 'available' | 'unavailable'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [promotedEndpointIds, setPromotedEndpointIds] = useState<Set<string>>(new Set());
  const [newEndpoint, setNewEndpoint] = useState({
    name: '',
    provider: '',
    category: 'chat',
    baseUrl: '',
    modelId: '',
    apiKey: '',
    authType: 'none',
    apiFormat: 'openai',
    isFree: true,
    priority: 50,
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRunningJob = status?.recentJobs?.some((j) => j.status === 'running' || j.status === 'pending') ?? false;

  const fetchPromotedIds = useCallback(() => {
    if (!token) return;
    fetch('/api/admin/custom-models', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.promotedEndpointIds) {
          setPromotedEndpointIds(new Set(data.promotedEndpointIds));
        }
      })
      .catch(() => {});
  }, [token]);

  const fetchStatus = useCallback(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetch('/api/admin/aggregator/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.scheduler || data.pool) setStatus(data);
      })
      .catch(() => toast.error('خطأ في تحميل حالة المُجمّع'))
      .finally(() => setLoading(false));
    // Also refresh promoted IDs
    fetchPromotedIds();
  }, [token, fetchPromotedIds]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Auto-poll when a job is running
  useEffect(() => {
    if (hasRunningJob) {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 5000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasRunningJob, fetchStatus]);

  const handleTrigger = async (type: 'full_cycle' | 'scrape' | 'validate') => {
    if (!token) { toast.error('لا يوجد رمز مصادقة'); return; }
    const labels: Record<string, string> = { full_cycle: 'دورة كاملة', scrape: 'سحب المصادر', validate: 'فحص APIs' };
    setActionLoading(type);
    try {
      const res = await fetch('/api/admin/aggregator/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success(`تم بدء ${labels[type]} بنجاح`);
      // Immediate refresh + poll will pick up changes
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally { setActionLoading(null); }
  };

  const handleSeed = async () => {
    if (!token) { toast.error('لا يوجد رمز مصادقة'); return; }
    setActionLoading('seed');
    try {
      const res = await fetch('/api/admin/aggregator/seed', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      const summary = data.summary ? ` (أضيف: ${data.summary.added}, حدّث: ${data.summary.updated}, أخطاء: ${data.summary.errors})` : '';
      toast.success((data.message || 'تم الزرع بنجاح') + summary);
      fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally { setActionLoading(null); }
  };

  const handleValidateEndpoint = async (endpointId: string) => {
    if (!token) { toast.error('لا يوجد رمز مصادقة'); return; }
    setActionLoading(`validate-${endpointId}`);
    try {
      const res = await fetch('/api/admin/aggregator/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpointId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success(data.message || 'تم بدء الفحص');
      setTimeout(fetchStatus, 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally { setActionLoading(null); }
  };

  const handleToggleEndpoint = async (endpointId: string, currentlyAvailable: boolean) => {
    if (!token) { toast.error('لا يوجد رمز مصادقة'); return; }
    setActionLoading(`toggle-${endpointId}`);
    try {
      const res = await fetch(`/api/admin/aggregator/pool/${endpointId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isAvailable: !currentlyAvailable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success(currentlyAvailable ? 'تم تعطيل النقطة' : 'تم تفعيل النقطة');
      fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally { setActionLoading(null); }
  };

  const handleDeleteEndpoint = async (endpointId: string) => {
    if (!token) { toast.error('لا يوجد رمز مصادقة'); return; }
    if (!confirm('هل أنت متأكد من حذف هذه النقطة؟')) return;
    setActionLoading(`delete-${endpointId}`);
    try {
      const res = await fetch(`/api/admin/aggregator/pool/${endpointId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم حذف النقطة');
      fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally { setActionLoading(null); }
  };

  const handleAddToModels = async (endpointId: string, endpointName: string, category: string) => {
    if (!token) { toast.error('لا يوجد رمز مصادقة'); return; }
    if (promotedEndpointIds.has(endpointId)) {
      toast.info('هذا النموذج مضاف بالفعل');
      return;
    }
    setActionLoading(`add-model-${endpointId}`);
    try {
      const res = await fetch('/api/admin/custom-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpointId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      const categoryLabels: Record<string, string> = { chat: 'الشات', image: 'الصور', video: 'الفيديو', asr: 'التعرف الصوتي', translation: 'الترجمة' };
      if (data.validationStatus === 'failed' && data.warning) {
        toast.warning(data.warning);
      } else if (data.validationStatus === 'warning' && data.warning) {
        toast.success(`تم إضافة "${endpointName}" إلى نماذج ${categoryLabels[category] || category}`);
        toast.info(data.warning);
      } else {
        toast.success(`تم إضافة "${endpointName}" إلى نماذج ${categoryLabels[category] || category}`);
      }
      // Update promoted IDs
      setPromotedEndpointIds(prev => new Set([...prev, endpointId]));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally { setActionLoading(null); }
  };

  const handleAddEndpoint = async () => {
    if (!token) { toast.error('لا يوجد رمز مصادقة'); return; }
    if (!newEndpoint.name || !newEndpoint.provider || !newEndpoint.category || !newEndpoint.baseUrl) {
      toast.error('الاسم والمزود والفئة ورابط API مطلوبون');
      return;
    }
    setActionLoading('add-endpoint');
    try {
      const res = await fetch('/api/admin/aggregator/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newEndpoint),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success(data.message || 'تم إضافة نقطة النهاية');
      setNewEndpoint({
        name: '', provider: '', category: 'chat', baseUrl: '', modelId: '',
        apiKey: '', authType: 'none', apiFormat: 'openai', isFree: true, priority: 50,
      });
      setShowAddForm(false);
      fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally { setActionLoading(null); }
  };

  const filteredEndpoints = (status?.endpoints ?? []).filter((ep) => {
    if (filterCategory !== 'all' && ep.category !== filterCategory) return false;
    if (filterProvider !== 'all' && ep.provider !== filterProvider) return false;
    if (filterAvailability === 'available' && !ep.isAvailable) return false;
    if (filterAvailability === 'unavailable' && ep.isAvailable) return false;
    return true;
  });

  const categories = [...new Set((status?.endpoints ?? []).map((e) => e.category))];
  const providers = [...new Set((status?.endpoints ?? []).map((e) => e.provider))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const availablePct = status?.pool?.totalEndpoints
    ? Math.round((status.pool.availableEndpoints / status.pool.totalEndpoints) * 100)
    : 0;
  const freeCount = (status?.endpoints ?? []).filter((e) => e.isFree).length;

  return (
    <div className="space-y-2" dir="rtl">
      {/* Compact Status Bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={status?.scheduler?.isRunning ? 'default' : 'secondary'} className="text-[9px] px-1.5">
          <Activity className="size-2.5 ml-0.5" />
          {status?.scheduler?.isRunning ? 'يعمل' : 'متوقف'}
        </Badge>
        <Badge variant="outline" className="text-[9px] px-1.5">
          <Database className="size-2.5 ml-0.5" />
          {status?.pool?.totalEndpoints ?? 0} واجهة
        </Badge>
        <Badge variant="outline" className="text-[9px] px-1.5 text-green-600 border-green-300 dark:text-green-400 dark:border-green-800">
          <Wifi className="size-2.5 ml-0.5" />
          {status?.pool?.availableEndpoints ?? 0} متاحة
        </Badge>
        <Badge variant="outline" className="text-[9px] px-1.5 text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-800">
          <Zap className="size-2.5 ml-0.5" />
          {availablePct}% توفر
        </Badge>
        <Badge variant="outline" className="text-[9px] px-1.5 text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-800">
          <Globe className="size-2.5 ml-0.5" />
          {freeCount} مجانية
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[9px] px-1.5 text-blue-600 hover:text-blue-700"
          onClick={async () => {
            if (!token) { toast.error('لا يوجد رمز مصادقة'); return; }
            try {
              const res = await fetch('/api/admin/custom-models', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'حدث خطأ');
              toast.success(data.message || `تم إصلاح ${data.fixed} نموذج`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'خطأ في الإصلاح');
            }
          }}
        >
          <RefreshCw className="size-2.5 ml-0.5" />
          إصلاح النماذج
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[9px] px-1.5 mr-auto"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? <ChevronUp className="size-2.5 ml-0.5" /> : <ChevronDown className="size-2.5 ml-0.5" />}
          {showDetails ? 'إخفاء' : 'تفاصيل'}
        </Button>
      </div>

      {/* Collapsible Details: Category/Provider + Recent Jobs */}
      {showDetails && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="py-0">
            <CardHeader className="pb-1 px-3 pt-2">
              <CardTitle className="text-[10px] font-medium">حسب الفئة</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2">
              <div className="space-y-0.5">
                {Object.entries(status?.pool?.byCategory ?? {}).map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">{cat}</span>
                    <Badge variant="secondary" className="text-[9px] px-1">{count as number}</Badge>
                  </div>
                ))}
                {Object.keys(status?.pool?.byCategory ?? {}).length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-1">لا توجد بيانات</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardHeader className="pb-1 px-3 pt-2">
              <CardTitle className="text-[10px] font-medium">حسب المزود</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2">
              <div className="space-y-0.5">
                {Object.entries(status?.pool?.byProvider ?? {}).map(([prov, count]) => (
                  <div key={prov} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">{prov}</span>
                    <Badge variant="secondary" className="text-[9px] px-1">{count as number}</Badge>
                  </div>
                ))}
                {Object.keys(status?.pool?.byProvider ?? {}).length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-1">لا توجد بيانات</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Collapsible: Recent Jobs */}
      {showDetails && status?.recentJobs && status.recentJobs.length > 0 && (
        <Card className="py-0">
          <CardHeader className="pb-1 px-3 pt-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-medium">أحدث المهام</CardTitle>
              {hasRunningJob && (
                <Badge variant="default" className="text-[8px] animate-pulse bg-blue-500 px-1">
                  <Clock className="size-2 ml-0.5" />
                  جارٍ التشغيل...
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2">
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {status.recentJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between text-[10px] border-b pb-0.5 last:border-0">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}
                      className="text-[8px] px-1"
                    >
                      {job.status === 'running' ? 'قيد التشغيل' : job.status === 'pending' ? 'في الانتظار' : job.status === 'completed' ? 'مكتمل' : 'فشل'}
                    </Badge>
                    <span className="text-muted-foreground">{job.type}</span>
                    {job.endpointsValidated > 0 && (
                      <span className="text-muted-foreground">({job.endpointsValidated} تحقق)</span>
                    )}
                  </div>
                  <span className="text-muted-foreground">{job.durationMs ? `${Math.round(job.durationMs / 1000)}s` : '—'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compact Action Buttons */}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={handleSeed} disabled={actionLoading === 'seed'} className="h-7 text-[10px] px-2 bg-blue-600 hover:bg-blue-700">
          <Database className="size-3 ml-0.5" />
          {actionLoading === 'seed' ? 'يجري الزرع...' : 'زرع'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleTrigger('validate')} disabled={actionLoading === 'validate'} className="h-7 text-[10px] px-2">
          <Activity className="size-3 ml-0.5" />
          {actionLoading === 'validate' ? 'يجري الفحص...' : 'فحص'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleTrigger('scrape')} disabled={actionLoading === 'scrape'} className="h-7 text-[10px] px-2">
          <Globe className="size-3 ml-0.5" />
          {actionLoading === 'scrape' ? 'يجري السحب...' : 'سحب'}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 border-blue-500 text-blue-600 hover:bg-blue-500" onClick={() => handleTrigger('scrape')} disabled={actionLoading === 'scrape'}>
          🤗 HF
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleTrigger('full_cycle')} disabled={actionLoading === 'full_cycle'} className="h-7 text-[10px] px-2">
          <Play className="size-3 ml-0.5" />
          {actionLoading === 'full_cycle' ? 'يجري...' : 'دورة'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)} className={`h-7 text-[10px] px-2 ${showAddForm ? 'bg-blue-500 border-blue-500' : ''}`}>
          {showAddForm ? <ChevronUp className="size-3 ml-0.5" /> : <Plus className="size-3 ml-0.5" />}
          {showAddForm ? 'إخفاء' : 'إضافة'}
        </Button>
        <Button size="sm" variant="ghost" onClick={fetchStatus} className="h-7 text-[10px] px-2">
          <RefreshCw className="size-3 ml-0.5" />
          تحديث
        </Button>
      </div>

      {/* Add Endpoint Form - Compact */}
      {showAddForm && (
        <Card className="border-blue-500 py-0">
          <CardHeader className="pb-1 px-3 pt-2">
            <CardTitle className="text-[10px] font-medium">إضافة نقطة نهاية جديدة</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-muted-foreground block mb-0.5">الاسم *</label>
                <input
                  type="text"
                  value={newEndpoint.name}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, name: e.target.value })}
                  placeholder="مثال: OpenAI GPT-4"
                  className="w-full text-[10px] bg-muted border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground block mb-0.5">المزود *</label>
                <input
                  type="text"
                  value={newEndpoint.provider}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, provider: e.target.value })}
                  placeholder="مثال: openai"
                  className="w-full text-[10px] bg-muted border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground block mb-0.5">الفئة *</label>
                <select
                  value={newEndpoint.category}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, category: e.target.value })}
                  className="w-full text-[10px] bg-muted border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="chat">شات</option>
                  <option value="image">صور</option>
                  <option value="video">فيديو</option>
                  <option value="asr">تعرف صوتي</option>
                  <option value="translation">ترجمة</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground block mb-0.5">رابط API *</label>
                <input
                  type="url"
                  value={newEndpoint.baseUrl}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="w-full text-[10px] bg-muted border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground block mb-0.5">معرف النموذج</label>
                <input
                  type="text"
                  value={newEndpoint.modelId}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, modelId: e.target.value })}
                  placeholder="gpt-4o"
                  className="w-full text-[10px] bg-muted border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground block mb-0.5">نوع المصادقة</label>
                <select
                  value={newEndpoint.authType}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, authType: e.target.value })}
                  className="w-full text-[10px] bg-muted border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="none">بدون</option>
                  <option value="bearer">Bearer</option>
                  <option value="x-api-key">X-API-Key</option>
                  <option value="custom">مخصص</option>
                </select>
              </div>
              {newEndpoint.authType !== 'none' && (
                <div>
                  <label className="text-[9px] text-muted-foreground block mb-0.5">مفتاح API</label>
                  <input
                    type="password"
                    value={newEndpoint.apiKey}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full text-[10px] bg-muted border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    dir="ltr"
                  />
                </div>
              )}
              <div>
                <label className="text-[9px] text-muted-foreground block mb-0.5">صيغة API</label>
                <select
                  value={newEndpoint.apiFormat}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, apiFormat: e.target.value })}
                  className="w-full text-[10px] bg-muted border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="openai">OpenAI</option>
                  <option value="hf-inference">HF Inference</option>
                  <option value="pollinations">Pollinations</option>
                  <option value="gemini">Gemini</option>
                  <option value="raw">Raw HTTP</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEndpoint.isFree}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, isFree: e.target.checked })}
                    className="rounded border-muted size-3"
                  />
                  مجاني
                </label>
                <div className="flex-1">
                  <label className="text-[9px] text-muted-foreground block mb-0.5">أولوية</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={newEndpoint.priority}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, priority: parseInt(e.target.value) || 50 })}
                    className="w-full text-[10px] bg-muted border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 mt-2">
              <Button size="sm" onClick={handleAddEndpoint} disabled={actionLoading === 'add-endpoint'} className="h-6 text-[10px] px-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="size-3 ml-0.5" />
                {actionLoading === 'add-endpoint' ? 'يجري...' : 'إضافة'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)} className="h-6 text-[10px]">
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Endpoints Table - Main Focus */}
      <Card className="py-0">
        <CardHeader className="pb-1 px-3 pt-2">
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <CardTitle className="text-[10px] font-medium">نقاط النهاية ({filteredEndpoints.length})</CardTitle>
            <div className="flex gap-1 flex-wrap">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="text-[9px] bg-muted border rounded px-1 py-0.5"
              >
                <option value="all">كل الفئات</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                className="text-[9px] bg-muted border rounded px-1 py-0.5"
              >
                <option value="all">كل المزودين</option>
                {providers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={filterAvailability}
                onChange={(e) => setFilterAvailability(e.target.value as 'all' | 'available' | 'unavailable')}
                className="text-[9px] bg-muted border rounded px-1 py-0.5"
              >
                <option value="all">الكل</option>
                <option value="available">متاح</option>
                <option value="unavailable">غير متاح</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[9px] h-6 py-0">الاسم</TableHead>
                  <TableHead className="text-[9px] h-6 py-0">الحالة</TableHead>
                  <TableHead className="text-[9px] h-6 py-0 hidden sm:table-cell">الأولوية</TableHead>
                  <TableHead className="text-[9px] h-6 py-0 hidden sm:table-cell">النجاح</TableHead>
                  <TableHead className="text-[9px] h-6 py-0 hidden md:table-cell">إخفاقات</TableHead>
                  <TableHead className="text-[9px] h-6 py-0">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEndpoints.map((ep) => (
                  <TableRow key={ep.id}>
                    <TableCell className="text-[9px] py-0.5">
                      <div>
                        <span className="font-medium">{ep.name}</span>
                        <span className="text-muted-foreground block text-[8px]">{ep.provider} · {ep.category}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-0.5">
                      <div className="flex flex-col gap-0.5">
                        <Badge variant={ep.isAvailable ? 'default' : 'destructive'} className="text-[8px] px-1 w-fit">
                          {ep.isAvailable ? 'متاح' : 'غير متاح'}
                        </Badge>
                        {ep.isFree && (
                          <Badge variant="secondary" className="text-[7px] px-1 bg-blue-500 text-blue-600 dark:text-blue-400 w-fit">
                            مجاني
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[9px] py-0.5 hidden sm:table-cell">{ep.priority}</TableCell>
                    <TableCell className="text-[9px] py-0.5 hidden sm:table-cell">
                      {ep.successRate != null ? `${Math.round(ep.successRate)}%` : '—'}
                    </TableCell>
                    <TableCell className="text-[9px] py-0.5 hidden md:table-cell">
                      {ep.consecutiveFails > 0 ? (
                        <span className="text-red-500">{ep.consecutiveFails}</span>
                      ) : '0'}
                    </TableCell>
                    <TableCell className="py-0.5">
                      <div className="flex gap-0.5 items-center">
                        {promotedEndpointIds.has(ep.id) ? (
                          <Badge className="text-[7px] px-1 py-0 bg-blue-500 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                            <Check className="size-2 ml-0.5" />
                            تمت
                          </Badge>
                        ) : ep.isAvailable ? (
                          <Button
                            size="sm"
                            className="h-5 text-[8px] px-1.5 bg-blue-600 hover:bg-blue-700 text-white gap-0.5"
                            onClick={() => handleAddToModels(ep.id, ep.name, ep.category)}
                            disabled={actionLoading === `add-model-${ep.id}`}
                          >
                            {actionLoading === `add-model-${ep.id}` ? (
                              <span className="animate-spin">⏳</span>
                            ) : (
                              <ArrowUpFromLine className="size-2.5" />
                            )}
                            أضف
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-4 p-0"
                          onClick={() => handleValidateEndpoint(ep.id)}
                          disabled={actionLoading === `validate-${ep.id}`}
                          title="فحص"
                        >
                          <Activity className="size-2.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-4 p-0"
                          onClick={() => handleToggleEndpoint(ep.id, ep.isAvailable)}
                          disabled={actionLoading === `toggle-${ep.id}`}
                          title={ep.isAvailable ? 'تعطيل' : 'تفعيل'}
                        >
                          {ep.isAvailable ? <XCircle className="size-2.5 text-red-400" /> : <CheckCircle className="size-2.5 text-green-400" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-4 p-0"
                          onClick={() => handleDeleteEndpoint(ep.id)}
                          disabled={actionLoading === `delete-${ep.id}`}
                          title="حذف"
                        >
                          <Trash2 className="size-2.5 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredEndpoints.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-[10px] text-muted-foreground py-3">
                      لا توجد نقاط نهاية — اضغط &quot;زرع&quot; لإضافة الواجهات المعروفة
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ApiEndpointsTab;

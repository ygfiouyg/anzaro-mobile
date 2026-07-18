'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  Activity,
  MessageSquare,
  FileText,
  Shield,
  Eye,
  EyeOff,
  AlertTriangle,
  HardDrive,
  Terminal,
  Coins,
  Search,
  Trash2,
  Crown,
  CheckCircle,
  XCircle,
  Clock,
  Cpu,
  Server,
  Wifi,
  FileUp,
  FolderOpen,
  RefreshCw,
  MessageCircle,
  LogOut,
  Zap,
  Database,
  Image as ImageIcon,
  Music,
  Video,
  File,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth-store';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { AdminDashboardProps, TraceLogEntry } from './admin/types';

// Import extracted tab components
import OverviewTab from './admin/OverviewTab';
import UsersTab from './admin/UsersTab';
import SettingsTab from './admin/SettingsTab';
import ApiEndpointsTab from './admin/ApiEndpointsTab';
import HFModelsTab from './admin/HFModelsTab';
import RadioTab from './admin/RadioTab';
import BroadcastsTab from './admin/BroadcastsTab';
import SystemPromptsTab from './admin/SystemPromptsTab';
import { AdminAgentChat } from '@/components/admin/AdminAgentChat';
import { ToolsHub } from '@/components/tools/ToolsHub';
import { SkillsHub } from '@/components/skills/SkillsHub';

// ============ Sessions Tab ============
function SessionsTab() {
  const { token } = useAuthStore();
  const [sessions, setSessions] = useState<Array<{
    id: string;
    token: string;
    device: string | null;
    ip: string | null;
    expiresAt: string;
    createdAt: string;
    user: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      avatar: string | null;
    };
  }>>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showExpired, setShowExpired] = useState(false);

  const fetchSessions = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/admin/sessions?active=${!showExpired}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.sessions) setSessions(data.sessions);
        setActiveCount(data.activeCount ?? 0);
        setExpiredCount(data.expiredCount ?? 0);
      })
      .catch(() => toast.error('خطأ في تحميل الجلسات'))
      .finally(() => setLoading(false));
  }, [token, showExpired]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleDeleteSession = async (sessionId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/sessions?id=${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم حذف الجلسة بنجاح');
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const handleCleanupExpired = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/sessions', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success(data.message || 'تم تنظيف الجلسات المنتهية');
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <Activity className="size-6 mx-auto text-blue-500 mb-1" />
            <p className="text-xs text-muted-foreground">جلسات نشطة</p>
            <p className="text-2xl font-bold text-blue-500">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <Clock className="size-6 mx-auto text-red-500 mb-1" />
            <p className="text-xs text-muted-foreground">جلسات منتهية</p>
            <p className="text-2xl font-bold text-red-500">{expiredCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={!showExpired ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowExpired(false)}
            className={!showExpired ? 'bg-blue-500 hover:bg-blue-600' : ''}
          >
            نشطة
          </Button>
          <Button
            variant={showExpired ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowExpired(true)}
            className={showExpired ? 'bg-red-500 hover:bg-red-600' : ''}
          >
            منتهية
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {expiredCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleCleanupExpired}>
              <Trash2 className="size-3 ml-1" />
              تنظيف المنتهية
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={fetchSessions} className="size-8">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Sessions List */}
      <ScrollArea className="h-[350px]">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Activity className="size-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">لا توجد جلسات {showExpired ? 'منتهية' : 'نشطة'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const isExpired = new Date(s.expiresAt) < new Date();
              return (
                <Card key={s.id} className="border-border">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isExpired ? 'bg-red-500' : 'bg-blue-500'}`}>
                          {s.user?.role === 'admin' ? (
                            <Crown className="size-4 text-blue-500" />
                          ) : (
                            <Users className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{s.user?.name || s.user?.email || 'مجهول'}</p>
                          <p className="text-xs text-muted-foreground" dir="ltr">{s.user?.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {s.device && (
                              <Badge variant="outline" className="text-[9px] px-1">{s.device}</Badge>
                            )}
                            {s.ip && (
                              <span className="text-[9px] text-muted-foreground" dir="ltr">{s.ip}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-left">
                          <Badge variant={isExpired ? 'destructive' : 'default'} className={isExpired ? '' : 'bg-blue-500 text-blue-600 dark:text-blue-400'}>
                            {isExpired ? 'منتهية' : 'نشطة'}
                          </Badge>
                          <p className="text-[9px] text-muted-foreground mt-1">
                            تنتهي: {new Date(s.expiresAt).toLocaleDateString('ar-EG')}
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            بدأت: {new Date(s.createdAt).toLocaleDateString('ar-EG')}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-red-500 hover:text-red-600"
                          onClick={() => handleDeleteSession(s.id)}
                          title="إنهاء الجلسة"
                        >
                          <LogOut className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ============ Conversations Tab ============
function ConversationsTab() {
  const { token } = useAuthStore();
  const [conversations, setConversations] = useState<Array<{
    id: string;
    title: string | null;
    model: string;
    context: string | null;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
    user: {
      id: string;
      email: string;
      name: string | null;
      avatar: string | null;
    };
    _count: { messages: number };
  }>>([]);
  const [total, setTotal] = useState(0);
  const [conversationsToday, setConversationsToday] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchConversations = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/admin/conversations?search=${encodeURIComponent(search)}&page=${page}&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.conversations) setConversations(data.conversations);
        setTotal(data.total ?? 0);
        setConversationsToday(data.conversationsToday ?? 0);
        setArchivedCount(data.archivedCount ?? 0);
      })
      .catch(() => toast.error('خطأ في تحميل المحادثات'))
      .finally(() => setLoading(false));
  }, [token, search, page]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/admin/conversations?search=${encodeURIComponent(search)}&page=${page}&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.conversations) setConversations(data.conversations);
          setTotal(data.total ?? 0);
          setConversationsToday(data.conversationsToday ?? 0);
          setArchivedCount(data.archivedCount ?? 0);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) { toast.error('خطأ في تحميل المحادثات'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [token, search, page]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <MessageCircle className="size-5 mx-auto text-blue-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">إجمالي المحادثات</p>
            <p className="text-lg font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <Zap className="size-5 mx-auto text-blue-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">محادثات اليوم</p>
            <p className="text-lg font-bold text-blue-500">{conversationsToday}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <Clock className="size-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-[10px] text-muted-foreground">مؤرشفة</p>
            <p className="text-lg font-bold">{archivedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="بحث في المحادثات..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pr-9"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={fetchConversations} className="size-8">
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {/* Conversations List */}
      <ScrollArea className="h-[350px]">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <MessageCircle className="size-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">لا توجد محادثات</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <Card key={conv.id} className="border-border">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500">
                        <MessageCircle className="size-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium truncate max-w-[200px]">
                          {conv.title || 'محادثة بدون عنوان'}
                        </p>
                        <p className="text-xs text-muted-foreground">{conv.user?.email || 'مجهول'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] px-1">{conv.model}</Badge>
                      <Badge variant="secondary" className="text-[9px] px-1">{conv._count.messages} رسالة</Badge>
                      {conv.isArchived && (
                        <Badge variant="outline" className="text-[9px] px-1 text-blue-500 border-blue-500">مؤرشفة</Badge>
                      )}
                      {conv.context && (
                        <Badge variant="outline" className="text-[9px] px-1">{conv.context}</Badge>
                      )}
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(conv.updatedAt).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </Button>
          <span className="text-xs text-muted-foreground">
            صفحة {page} من {Math.ceil(total / 20)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)}>
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}

// ============ Error Log Tab (connected to trace logger) ============
function ErrorLogTab() {
  const { token } = useAuthStore();
  const [logs, setLogs] = useState<TraceLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to trace SSE endpoint
    const es = new EventSource('/api/trace/events');
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'history' && data.entries) {
          setLogs(data.entries);
        } else if (data.type === 'heartbeat') {
          // ignore
        } else if (data.id && data.message) {
          // New trace entry
          setLogs((prev) => {
            const updated = [...prev, data];
            return updated.slice(-100); // Keep last 100
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      // Fallback: load from admin settings just to have something
      if (token) {
        setLogs((prev) => prev.length > 0 ? prev : [
          { id: 'fallback-1', timestamp: Date.now(), category: 'system', icon: '⚙️', message: 'لا يمكن الاتصال بخادم التتبع', level: 'warn' as const },
        ]);
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [token]);

  const handleClear = async () => {
    try {
      await fetch('/api/trace/events', { method: 'DELETE' });
      setLogs([]);
      toast.success('تم مسح السجلات');
    } catch {
      toast.error('خطأ في مسح السجلات');
    }
  };

  const levelConfig: Record<string, { color: string; bg: string; icon: typeof AlertTriangle }> = {
    error: { color: 'text-red-500', bg: 'bg-red-500', icon: XCircle },
    warn: { color: 'text-blue-500', bg: 'bg-blue-500', icon: AlertTriangle },
    warning: { color: 'text-blue-500', bg: 'bg-blue-500', icon: AlertTriangle },
    info: { color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950', icon: CheckCircle },
    success: { color: 'text-blue-500', bg: 'bg-blue-500', icon: CheckCircle },
  };

  const levelLabels: Record<string, string> = {
    error: 'خطأ',
    warn: 'تحذير',
    warning: 'تحذير',
    info: 'معلومات',
    success: 'نجاح',
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`size-2 rounded-full ${connected ? 'bg-blue-500' : 'bg-red-500'}`} />
          <span className="text-xs text-muted-foreground">
            {connected ? 'متصل' : 'غير متصل'}
          </span>
          <Badge variant="secondary" className="text-xs">{logs.length} سجل</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleClear}>
          <Trash2 className="size-3 ml-1" />
          مسح
        </Button>
      </div>

      <ScrollArea className="h-[400px]">
        {logs.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Activity className="size-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">لا توجد سجلات بعد</p>
            <p className="text-xs mt-1">السجلات ستظهر هنا عند حدوث نشاط</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...logs].reverse().map((log) => {
              const config = levelConfig[log.level] || levelConfig.info;
              const Icon = config.icon;
              return (
                <div key={log.id} className={`flex items-start gap-3 p-3 rounded-lg ${config.bg}`}>
                  <span className="text-sm flex-shrink-0">{log.icon}</span>
                  <Icon className={`size-4 mt-0.5 flex-shrink-0 ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{log.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString('ar-EG')}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1">
                        {log.category}
                      </Badge>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${config.color} border-current text-[10px] flex-shrink-0`}
                  >
                    {levelLabels[log.level] || log.level}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ============ Delta Drive Tab (real files from download/) ============
function DeltaDriveTab() {
  const { token } = useAuthStore();
  const [files, setFiles] = useState<Array<{ name: string; size: number; date: string; type: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  const fetchFiles = useCallback(() => {
    if (!token) return;
    fetch('/api/admin/drive/files', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.files) setFiles(data.files);
      })
      .catch(() => toast.error('خطأ في تحميل الملفات'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string): React.ComponentType<{ className?: string }> => {
    switch (type) {
      case 'pdf': return FileText;
      case 'image': return ImageIcon;
      case 'audio': return Music;
      case 'video': return Video;
      case 'document': return File;
      default: return File;
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Google Drive Status */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-blue-500" />
              <span className="text-sm font-medium">تكامل Google Drive</span>
            </div>
            <Badge variant="outline" className="text-blue-500 border-blue-500">
              غير متصل
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          toast.info('لرفع الملفات، استخدم المحادثة أو قسم الملفات');
        }}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-500'
            : 'border-border hover:border-blue-500'
        }`}
      >
        <FileUp className="size-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium">اسحب الملفات وأفلتها هنا</p>
        <p className="text-xs text-muted-foreground mt-1">سيتم رفعها لمجلد التحميل</p>
      </div>

      {/* File List */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderOpen className="size-4" />
              الملفات ({files.length})
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchFiles}>
              <RefreshCw className="size-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            {loading ? (
              <div className="flex items-center justify-center h-16">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
              </div>
            ) : files.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">لا توجد ملفات في مجلد التحميل</p>
            ) : (
              <div className="space-y-2">
                {files.map((f, i) => {
                  const Icon = getFileIcon(f.type);
                  return (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg muted">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-muted-foreground" />
                        <span className="text-sm truncate max-w-[150px]">{f.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] px-1">{f.type}</Badge>
                        <span>{formatFileSize(f.size)}</span>
                        <span>{new Date(f.date).toLocaleDateString('ar-EG')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Command Terminal Tab ============
function CommandTerminalTab() {
  const { token } = useAuthStore();
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<Array<{ text: string; type: 'input' | 'output' | 'error' }>>([
    { text: 'مرحباً بك في محطة أوامر Anzaro AI', type: 'output' },
    { text: 'اكتب "help" لعرض الأوامر المتاحة', type: 'output' },
  ]);

  const processCommand = async (cmd: string) => {
    const trimmed = cmd.trim().toLowerCase();
    setOutput((o) => [...o, { text: `> ${cmd}`, type: 'input' as const }]);

    if (trimmed === 'clear') {
      setOutput([]);
      return;
    }

    if (trimmed === 'help') {
      const helpText = [
        '═══════ الأوامر المتاحة ═══════',
        'status    - حالة النظام',
        'users     - قائمة المستخدمين',
        'stats     - إحصائيات عامة',
        'memory    - استخدام الذاكرة',
        'conversations - إحصائيات المحادثات',
        'sessions  - الجلسات النشطة',
        'keys      - مفاتيح API',
        'logs      - آخر السجلات',
        'clear     - مسح الشاشة',
        'help      - عرض المساعدة',
      ];
      helpText.forEach((line) => {
        setOutput((o) => [...o, { text: line, type: 'output' as const }]);
      });
      return;
    }

    if (!token) {
      setOutput((o) => [...o, { text: 'خطأ: غير مصرح', type: 'error' as const }]);
      return;
    }

    try {
      if (trimmed === 'stats' || trimmed === 'status') {
        const res = await fetch('/api/admin/real-stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.stats) {
          const s = data.stats;
          const lines = [
            `إجمالي المستخدمين: ${s.totalUsers}`,
            `المستخدمين النشطين: ${s.activeUsers}`,
            `رسائل اليوم: ${s.messagesToday}`,
            `إجمالي الرسائل: ${s.totalMessages}`,
            `إجمالي المحادثات: ${s.totalConversations}`,
            `محادثات اليوم: ${s.conversationsToday}`,
            `ملفات PDF: ${s.pdfsGenerated}`,
            `الجلسات النشطة: ${s.activeSessions}`,
          ];
          if (data.health) {
            lines.push(`قاعدة البيانات: ${data.health.database?.status ? 'نشط' : 'متوقف'} (${data.health.database?.responseTime ?? '?'}ms)`);
          }
          lines.forEach((l) => setOutput((o) => [...o, { text: l, type: 'output' as const }]));
        }
      } else if (trimmed === 'users') {
        const res = await fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.users) {
          setOutput((o) => [...o, { text: `عدد المستخدمين: ${data.users.length}`, type: 'output' as const }]);
          data.users.slice(0, 5).forEach((u: { name: string | null; email: string; role: string; isActive: boolean }) => {
            setOutput((o) => [...o, { text: `  ${u.name || '—'} | ${u.email} | ${u.role} | ${u.isActive ? 'نشط' : 'محظور'}`, type: 'output' as const }]);
          });
          if (data.users.length > 5) {
            setOutput((o) => [...o, { text: `  ... و${data.users.length - 5} آخر`, type: 'output' as const }]);
          }
        }
      } else if (trimmed === 'sessions') {
        const res = await fetch('/api/admin/sessions?active=true', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const lines = [
          `الجلسات النشطة: ${data.activeCount ?? 0}`,
          `الجلسات المنتهية: ${data.expiredCount ?? 0}`,
        ];
        if (data.sessions && data.sessions.length > 0) {
          data.sessions.slice(0, 5).forEach((s: { user: { email: string }; device: string | null; createdAt: string }) => {
            lines.push(`  ${s.user?.email || 'مجهول'} | ${s.device || '—'} | ${new Date(s.createdAt).toLocaleDateString('ar-EG')}`);
          });
        }
        lines.forEach((l) => setOutput((o) => [...o, { text: l, type: 'output' as const }]));
      } else if (trimmed === 'memory') {
        const res = await fetch('/api/system/info');
        const data = await res.json();
        if (data.memory) {
          const lines = [
            `RSS: ${Math.round(data.memory.rss / 1024 / 1024)} MB`,
            `Heap Used: ${Math.round(data.memory.heapUsed / 1024 / 1024)} MB`,
            `Heap Total: ${Math.round(data.memory.heapTotal / 1024 / 1024)} MB`,
            `External: ${Math.round(data.memory.external / 1024 / 1024)} MB`,
            `Uptime: ${data.uptime?.formatted || '—'}`,
            `Node.js: ${data.node?.version || '—'}`,
          ];
          lines.forEach((l) => setOutput((o) => [...o, { text: l, type: 'output' as const }]));
        } else {
          setOutput((o) => [...o, { text: 'تعذر جلب معلومات الذاكرة', type: 'error' as const }]);
        }
      } else if (trimmed === 'conversations') {
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const lines = [
          `إجمالي المحادثات: ${data.totalConversations ?? '—'}`,
          `محادثات اليوم: ${data.conversationsToday ?? '—'}`,
          `رسائل المستخدمين: ${data.userMessages ?? '—'}`,
          `رسائل المساعد: ${data.assistantMessages ?? '—'}`,
        ];
        lines.forEach((l) => setOutput((o) => [...o, { text: l, type: 'output' as const }]));
      } else if (trimmed === 'keys') {
        const res = await fetch('/api/admin/api-keys', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.keys) {
          const lines = [
            `Zhipu Agent: ${data.keys.zhipu_agent_key ? '✓ مضبوط' : '✗ غير مضبوط'}`,
            `Zhipu Platform: ${data.keys.zhipu_platform_key ? '✓ مضبوط' : '✗ غير مضبوط'}`,
            `Google AI: ${data.keys.google_ai_key ? '✓ مضبوط' : '✗ غير مضبوط'}`,
          ];
          lines.forEach((l) => setOutput((o) => [...o, { text: l, type: 'output' as const }]));
        }
      } else if (trimmed === 'logs') {
        const res = await fetch('/api/admin/real-stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.stats?.recentActivity) {
          data.stats.recentActivity.forEach((a: { action: string; user: string; time: string }) => {
            setOutput((o) => [...o, { text: `[${a.time}] ${a.action} — ${a.user}`, type: 'output' as const }]);
          });
        } else {
          setOutput((o) => [...o, { text: 'لا توجد سجلات نشاط', type: 'output' as const }]);
        }
      } else {
        setOutput((o) => [...o, { text: `أمر غير معروف: "${trimmed}". اكتب "help" للمساعدة.`, type: 'error' as const }]);
      }
    } catch {
      setOutput((o) => [...o, { text: 'خطأ في تنفيذ الأمر', type: 'error' as const }]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    processCommand(command);
    setCommand('');
  };

  return (
    <div className="space-y-3" dir="ltr">
      <div className="bg-zinc-950 dark:bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        {/* Terminal Header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-800 border-b border-zinc-800">
          <div className="size-3 rounded-full bg-red-500" />
          <div className="size-3 rounded-full bg-blue-500" />
          <div className="size-3 rounded-full bg-blue-500" />
          <span className="text-zinc-500 text-xs mr-2 font-mono">Anzaro AI Terminal</span>
        </div>

        {/* Output */}
        <ScrollArea className="h-72 p-4">
          <div className="space-y-1 font-mono text-sm">
            {output.map((line, i) => (
              <div
                key={i}
                className={
                  line.type === 'input'
                    ? 'text-blue-400'
                    : line.type === 'error'
                      ? 'text-red-400'
                      : 'text-zinc-300'
                }
              >
                {line.text}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800">
          <Terminal className="size-4 text-blue-500" />
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="flex-1 bg-transparent text-blue-400 font-mono text-sm outline-none placeholder:text-zinc-600"
            placeholder="اكتب أمراً..."
            autoFocus
          />
        </form>
      </div>
    </div>
  );
}

// ============ Tokens Tab ============
function TokensTab() {
  const { token } = useAuthStore();
  const [tokenData, setTokenData] = useState<{
    remaining: number;
    used: number;
    total: number;
  } | null>(null);
  const [chartData, setChartData] = useState<Array<{ day: string; tokens: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const remaining = data.tokenRemaining ?? 0;
        const used = data.tokenUsed ?? 0;
        setTokenData({ remaining, used, total: remaining + used });

        // Use real daily stats if available
        if (data.dailyStats && Array.isArray(data.dailyStats)) {
          const chart = data?.dailyStats?.map((s: { date: string; messages: number }) => ({
            day: new Date(s.date).toLocaleDateString('ar-EG', { weekday: 'short' }),
            tokens: s.messages * 150, // Estimate tokens from messages
          }));
          setChartData(chart);
        }
      })
      .catch(() => {
        setTokenData({ remaining: 0, used: 0, total: 0 });
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Token Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <Coins className="size-8 mx-auto text-blue-500 mb-2" />
            <p className="text-xs text-muted-foreground">التوكنز المتبقية</p>
            <p className="text-2xl font-bold text-blue-500">
              {tokenData ? tokenData.remaining.toLocaleString() : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <Activity className="size-8 mx-auto text-blue-500 mb-2" />
            <p className="text-xs text-muted-foreground">التوكنز المستخدمة</p>
            <p className="text-2xl font-bold text-blue-500">
              {tokenData ? tokenData.used.toLocaleString() : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Progress */}
      {tokenData && tokenData.total > 0 && (
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex justify-between text-sm mb-2">
              <span>استخدام التوكنز</span>
              <span className="text-muted-foreground">
                {Math.round((tokenData.used / tokenData.total) * 100)}%
              </span>
            </div>
            <Progress
              value={(tokenData.used / tokenData.total) * 100}
              className="h-3 [&>div]:bg-blue-500"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {tokenData.used.toLocaleString()} / {tokenData.total.toLocaleString()} توكن
            </p>
          </CardContent>
        </Card>
      )}

      {/* Daily Usage Chart */}
      {chartData.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">الاستخدام اليومي (آخر 7 أيام)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="tokens" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ Main Admin Dashboard ============
export default function AdminDashboard({ open, onOpenChange }: AdminDashboardProps) {
  const { token } = useAuthStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl h-[95vh] sm:h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-1 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base" dir="rtl">
            <Shield className="size-4 text-blue-500" />
            لوحة تحكم الآدمن
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="overview" className="px-4 pb-3 flex-1 flex flex-col min-h-0">
          <div className="admin-tabs-scroll overflow-x-auto overflow-y-hidden shrink-0 -mx-4 px-4 touch-pan-x overscroll-x-contain" style={{ WebkitOverflowScrolling: "touch" }}>
            <TabsList className="w-max inline-flex h-8 gap-0.5">
              <TabsTrigger value="overview" className="text-[10px] px-2 h-7">نظرة عامة</TabsTrigger>
              <TabsTrigger value="users" className="text-[10px] px-2 h-7">المستخدمين</TabsTrigger>
              <TabsTrigger value="sessions" className="text-[10px] px-2 h-7">الجلسات</TabsTrigger>
              <TabsTrigger value="conversations" className="text-[10px] px-2 h-7">المحادثات</TabsTrigger>
              <TabsTrigger value="api-keys" className="text-[10px] px-2 h-7">المفاتيح</TabsTrigger>
              <TabsTrigger value="broadcast" className="text-[10px] px-2 h-7">البث</TabsTrigger>
              <TabsTrigger value="error-log" className="text-[10px] px-2 h-7">السجلات</TabsTrigger>
              <TabsTrigger value="drive" className="text-[10px] px-2 h-7">الملفات</TabsTrigger>
              <TabsTrigger value="terminal" className="text-[10px] px-2 h-7">الطرفية</TabsTrigger>
              <TabsTrigger value="tokens" className="text-[10px] px-2 h-7">التوكنز</TabsTrigger>
              <TabsTrigger value="aggregator" className="text-[10px] px-2 h-7 text-blue-600 dark:text-blue-400">المُجمّع</TabsTrigger>
              <TabsTrigger value="hf-models" className="text-[10px] px-2 h-7">🤗 النماذج</TabsTrigger>
              <TabsTrigger value="radio" className="text-[10px] px-2 h-7">📻 الراديو</TabsTrigger>
              <TabsTrigger value="system-prompts" className="text-[10px] px-2 h-7">📝 البرومبتس</TabsTrigger>
              <TabsTrigger value="agent" className="text-[10px] px-2 h-7 text-blue-600 dark:text-blue-400 font-bold">🤖 الوكيل الذكي</TabsTrigger>
              <TabsTrigger value="tools" className="text-[10px] px-2 h-7 text-blue-600 dark:text-blue-400 font-bold">📦 مركز الأدوات</TabsTrigger>
              <TabsTrigger value="skills" className="text-[10px] px-2 h-7 text-blue-600 dark:text-blue-400 font-bold">🧠 المهارات</TabsTrigger>
            </TabsList>
          </div>
          <div className="admin-content-scroll mt-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <TabsContent value="overview"><OverviewTab token={token} /></TabsContent>
            <TabsContent value="users"><UsersTab token={token} /></TabsContent>
            <TabsContent value="sessions"><SessionsTab /></TabsContent>
            <TabsContent value="conversations"><ConversationsTab /></TabsContent>
            <TabsContent value="api-keys"><SettingsTab token={token} /></TabsContent>
            <TabsContent value="broadcast"><BroadcastsTab token={token} /></TabsContent>
            <TabsContent value="error-log"><ErrorLogTab /></TabsContent>
            <TabsContent value="drive"><DeltaDriveTab /></TabsContent>
            <TabsContent value="terminal"><CommandTerminalTab /></TabsContent>
            <TabsContent value="tokens"><TokensTab /></TabsContent>
            <TabsContent value="aggregator"><ApiEndpointsTab token={token} /></TabsContent>
            <TabsContent value="hf-models"><HFModelsTab token={token} /></TabsContent>
            <TabsContent value="radio"><RadioTab token={token} /></TabsContent>
            <TabsContent value="system-prompts"><SystemPromptsTab token={token} /></TabsContent>
            <TabsContent value="agent" className="h-full min-h-[600px] mt-0 data-[state=active]:flex data-[state=active]:flex-col data-[state=active]:overflow-hidden"><AdminAgentChat /></TabsContent>
            <TabsContent value="tools" className="h-full min-h-[600px] mt-0 data-[state=active]:flex data-[state=active]:flex-col data-[state=active]:overflow-hidden"><ToolsHub /></TabsContent>
            <TabsContent value="skills" className="h-full min-h-[600px] mt-0 data-[state=active]:flex data-[state=active]:flex-col data-[state=active]:overflow-hidden"><SkillsHub /></TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

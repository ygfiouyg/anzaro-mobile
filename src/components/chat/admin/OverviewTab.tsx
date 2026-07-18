'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  Activity,
  MessageSquare,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Cpu,
  Server,
  Wifi,
  RefreshCw,
  MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { OverviewStats, SystemHealth } from './types';

interface OverviewTabProps {
  token: string | null;
}

function OverviewTab({ token }: OverviewTabProps) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [voiceServiceOnline, setVoiceServiceOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch('/api/admin/real-stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.stats) setStats(data.stats);
        if (data.health) setHealth(data.health);
      })
      .catch(() => { toast.error('خطأ في تحميل الإحصائيات'); })
      .finally(() => { setLoading(false); });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/admin/real-stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.stats) setStats(data.stats);
          if (data.health) setHealth(data.health);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) { toast.error('خطأ في تحميل الإحصائيات'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [token]);

  // Check voice service health
  useEffect(() => {
    fetch('/api/voice/health')
      .then((r) => r.json())
      .then((data) => { setVoiceServiceOnline(data.status === 'ok' || data.healthy === true); })
      .catch(() => { setVoiceServiceOnline(false); });
  }, []);

  const systemHealth = [
    { name: 'API', status: health?.api?.status ?? true, label: health?.api?.label ?? 'نشط', icon: Wifi },
    { name: 'قاعدة البيانات', status: health?.database?.status ?? false, label: health?.database?.label ?? 'فحص...', detail: health?.database?.responseTime != null ? `${health.database.responseTime}ms` : undefined, icon: Server },
    { name: 'خدمة الصوت', status: voiceServiceOnline, label: voiceServiceOnline ? 'نشط' : 'متوقف', icon: Activity },
    { name: 'محرك PDF', status: health?.pdfEngine?.status ?? true, label: health?.pdfEngine?.label ?? 'نشط', icon: FileText },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Stats Cards */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-muted-foreground">نظرة عامة على النظام</h3>
        <Button variant="ghost" size="sm" onClick={fetchStats} className="size-8 p-0">
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            title: 'إجمالي المستخدمين',
            value: stats?.totalUsers ?? 0,
            icon: Users,
            color: 'text-blue-500',
            bg: 'bg-blue-500',
          },
          {
            title: 'الجلسات النشطة',
            value: stats?.activeSessions ?? 0,
            icon: Activity,
            color: 'text-blue-500',
            bg: 'bg-blue-50 dark:bg-blue-950',
          },
          {
            title: 'رسائل اليوم',
            value: stats?.messagesToday ?? 0,
            icon: MessageSquare,
            color: 'text-blue-500',
            bg: 'bg-blue-500',
          },
          {
            title: 'المحادثات',
            value: stats?.totalConversations ?? 0,
            icon: MessageCircle,
            color: 'text-blue-500',
            bg: 'bg-blue-500',
          },
        ].map((card) => (
          <Card key={card.title} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`size-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="text-xl font-bold">{card.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Model Usage */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">استخدام النماذج</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stats?.modelUsage ?? []).length > 0 ? (
              (stats?.modelUsage ?? []).map((m) => (
                <div key={m.model} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{m.model}</span>
                    <span className="text-muted-foreground">{m.percentage}% ({m.count})</span>
                  </div>
                  <Progress value={m.percentage} className="h-2 [&>div]:bg-blue-500" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات استخدام بعد</p>
            )}
          </CardContent>
        </Card>

        {/* System Health */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">صحة النظام</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {systemHealth.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {item.status ? (
                    <CheckCircle className="size-4 text-blue-500" />
                  ) : (
                    <XCircle className="size-4 text-red-500" />
                  )}
                  <span className="text-sm">{item.name}</span>
                  {item.detail && (
                    <span className="text-xs text-muted-foreground">({item.detail})</span>
                  )}
                </div>
                <Badge
                  variant={item.status ? 'default' : 'destructive'}
                  className={
                    item.status
                      ? 'bg-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-500'
                      : ''
                  }
                >
                  {item.label}
                </Badge>
              </div>
            ))}
            <div className="border-t border-border pt-3 mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  <span>إجمالي الرسائل</span>
                </div>
                <span className="text-blue-500 font-medium">{stats?.totalMessages ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Cpu className="size-4 text-muted-foreground" />
                  <span>مستخدمين نشطين (24س)</span>
                </div>
                <span className="text-blue-500 font-medium">{stats?.activeUsers ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span>ملفات PDF</span>
                </div>
                <span className="text-blue-500 font-medium">{stats?.pdfsGenerated ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">النشاط الأخير</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {(stats?.recentActivity ?? []).length > 0 ? (
                (stats?.recentActivity ?? []).map((activity, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="size-1.5 rounded-full bg-blue-500" />
                      <span className="text-sm">{activity.action}</span>
                      <span className="text-xs text-muted-foreground">({activity.user})</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{activity.time}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">لا يوجد نشاط بعد</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default OverviewTab;

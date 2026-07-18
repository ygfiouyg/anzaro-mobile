'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Eye,
  EyeOff,
  Server,
  Wifi,
} from 'lucide-react';
import { toast } from 'sonner';

interface SettingsTabProps {
  token: string | null;
}

function SettingsTab({ token }: SettingsTabProps) {
  const [keys, setKeys] = useState({
    zhipu_agent_key: '',
    zhipu_platform_key: '',
    google_ai_key: '',
  });
  const [visibility, setVisibility] = useState({
    zhipu_agent_key: false,
    zhipu_platform_key: false,
    google_ai_key: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch('/api/admin/api-keys', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.keys) {
          setKeys({
            zhipu_agent_key: data.keys.zhipu_agent_key || '',
            zhipu_platform_key: data.keys.zhipu_platform_key || '',
            google_ai_key: data.keys.google_ai_key || '',
          });
        }
      })
      .catch(() => toast.error('خطأ في تحميل المفاتيح'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(keys),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم حفظ المفاتيح بنجاح');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const keyFields = [
    { key: 'zhipu_agent_key' as const, label: 'مفتاح ZhipuAI Agent', icon: Shield },
    { key: 'zhipu_platform_key' as const, label: 'مفتاح ZhipuAI Platform', icon: Server },
    { key: 'google_ai_key' as const, label: 'مفتاح Google AI', icon: Wifi },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {keyFields.map((field) => (
        <Card key={field.key} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <field.icon className="size-4 text-blue-500" />
              <span className="text-sm font-medium">{field.label}</span>
              {keys[field.key] && (
                <Badge variant="outline" className="text-[9px] px-1 text-blue-500 border-blue-500">مضبوط</Badge>
              )}
            </div>
            <div className="relative">
              <Input
                type={visibility[field.key] ? 'text' : 'password'}
                value={keys[field.key]}
                onChange={(e) => setKeys((k) => ({ ...k, [field.key]: e.target.value }))}
                placeholder={`أدخل ${field.label}...`}
                className="pl-10"
                dir="ltr"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-1 top-1/2 -translate-y-1/2 size-8"
                onClick={() => setVisibility((v) => ({ ...v, [field.key]: !v[field.key] }))}
                tabIndex={-1}
                aria-label={visibility[field.key] ? 'إخفاء' : 'إظهار'}
              >
                {visibility[field.key] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-gradient-to-l from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500"
      >
        {saving ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white ml-2" />
        ) : null}
        {saving ? 'جاري الحفظ...' : 'حفظ المفاتيح'}
      </Button>
    </div>
  );
}

export default SettingsTab;

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle,
  XCircle,
  Trash2,
  Plus,
  RefreshCw,
  Radio,
} from 'lucide-react';
import { toast } from 'sonner';
import type { RadioStationItem } from './types';
import { RADIO_CATEGORIES } from './types';

interface RadioTabProps {
  token: string | null;
}

function RadioTab({ token }: RadioTabProps) {
  const [stations, setStations] = useState<RadioStationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    streamUrl: '',
    logo: '',
    category: 'islamic',
    sortOrder: 0,
  });

  const fetchStations = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch('/api/radio/stations?all=true', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.stations) setStations(data.stations);
      })
      .catch(() => toast.error('خطأ في تحميل المحطات'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  const handleCreate = async () => {
    if (!token) return;
    if (!formData.name.trim() || !formData.streamUrl.trim()) {
      toast.error('اسم المحطة ورابط البث مطلوبان');
      return;
    }
    try {
      const res = await fetch('/api/radio/stations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          streamUrl: formData.streamUrl,
          logo: formData.logo || undefined,
          category: formData.category,
          sortOrder: formData.sortOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم إضافة المحطة بنجاح');
      setFormData({ name: '', streamUrl: '', logo: '', category: 'islamic', sortOrder: 0 });
      setShowForm(false);
      fetchStations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const handleToggleActive = async (station: RadioStationItem) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/radio/stations/${station.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !station.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success(station.isActive ? 'تم تعطيل المحطة' : 'تم تفعيل المحطة');
      fetchStations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const handleDelete = async (stationId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/radio/stations/${stationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم حذف المحطة بنجاح');
      fetchStations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const getCategoryLabel = (cat: string) => {
    return RADIO_CATEGORIES.find(c => c.value === cat)?.label || cat;
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'islamic': return 'bg-blue-500 text-blue-600 dark:text-blue-400';
      case 'quran': return 'bg-blue-500 text-blue-600 dark:text-blue-400';
      case 'music': return 'bg-blue-500 text-blue-600 dark:text-blue-400';
      case 'news': return 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400';
      default: return 'muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-blue-500" />
          <h3 className="text-sm font-medium">إدارة محطات الراديو</h3>
          <Badge variant="secondary" className="text-[10px]">{stations.length} محطة</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchStations} className="size-8">
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-500 hover:bg-blue-600"
          >
            <Plus className="size-3.5 ml-1" />
            إضافة محطة
          </Button>
        </div>
      </div>

      {/* Add Station Form */}
      {showForm && (
        <Card className="border-blue-500 bg-blue-500">
          <CardContent className="p-4 space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Plus className="size-4 text-blue-500" />
              إضافة محطة جديدة
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">اسم المحطة *</label>
                <Input
                  placeholder="مثال: إذاعة القرآن الكريم"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">رابط البث *</label>
                <Input
                  placeholder="https://stream.example.com/station"
                  value={formData.streamUrl}
                  onChange={(e) => setFormData({ ...formData, streamUrl: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">رابط الشعار (اختياري)</label>
                <Input
                  placeholder="https://example.com/logo.png"
                  value={formData.logo}
                  onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">التصنيف</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  {RADIO_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">ترتيب الفرز</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleCreate}
                className="bg-blue-500 hover:bg-blue-600"
              >
                <CheckCircle className="size-3.5 ml-1" />
                إنشاء المحطة
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setFormData({ name: '', streamUrl: '', logo: '', category: 'islamic', sortOrder: 0 });
                }}
              >
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stations List */}
      <ScrollArea className="h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : stations.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Radio className="size-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">لا توجد محطات راديو</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stations.map((station) => (
              <Card key={station.id} className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${station.isActive ? 'bg-blue-500' : 'muted'}`}>
                        <Radio className={`size-4 ${station.isActive ? 'text-blue-500' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{station.name}</span>
                          <Badge className={`text-[9px] ${getCategoryColor(station.category)}`}>
                            {getCategoryLabel(station.category)}
                          </Badge>
                          <Badge variant={station.isActive ? 'default' : 'destructive'} className="text-[9px]">
                            {station.isActive ? 'نشطة' : 'معطلة'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[250px]" dir="ltr">
                          {station.streamUrl}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            ترتيب: {station.sortOrder}
                          </span>
                          {station.createdAt && (
                            <span className="text-[10px] text-muted-foreground">
                              أُضيفت: {new Date(station.createdAt).toLocaleDateString('ar-EG')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`size-7 ${station.isActive ? 'text-blue-500' : 'text-blue-500'}`}
                        onClick={() => handleToggleActive(station)}
                        title={station.isActive ? 'تعطيل' : 'تفعيل'}
                      >
                        {station.isActive ? <XCircle className="size-3" /> : <CheckCircle className="size-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(station.id)}
                        title="حذف"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default RadioTab;

'use client';

import { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Eye, EyeOff, RefreshCw, ShieldCheck, AlertCircle } from 'lucide-react';
import { authFetch } from '@/lib/auth-fetch';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ApiKey {
  id: string;
  provider: string;
  label?: string;
  maskedKey: string;
  createdAt: string;
  active: boolean;
}

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', color: 'bg-emerald-500/10 text-emerald-500' },
  { id: 'anthropic', label: 'Anthropic', color: 'bg-amber-500/10 text-amber-500' },
  { id: 'google', label: 'Google AI', color: 'bg-blue-500/10 text-blue-500' },
  { id: 'groq', label: 'Groq', color: 'bg-orange-500/10 text-orange-500' },
  { id: 'huggingface', label: 'HuggingFace', color: 'bg-yellow-500/10 text-yellow-600' },
  { id: 'cerebras', label: 'Cerebras', color: 'bg-rose-500/10 text-rose-500' },
];

/**
 * KeysDashboard — manage API keys for AI providers.
 * Keys are stored encrypted server-side; only masked version is shown here.
 */
export function KeysDashboard() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState('openai');
  const [keyValue, setKeyValue] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/api-keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(Array.isArray(data) ? data : (data.keys ?? []));
      }
    } catch (e) {
      console.error('[keys] load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyValue.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: keyValue.trim(), label: label.trim() || undefined }),
      });
      if (res.ok) {
        setKeyValue('');
        setLabel('');
        setShowAdd(false);
        await load();
        toast.success('اتضاف المفتاح بنجاح');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'فشل إضافة المفتاح');
      }
    } catch {
      toast.error('خطأ في الشبكة');
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (id: string) => {
    try {
      const res = await authFetch(`/api/admin/api-keys?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await load();
        toast.success('اتمسح المفتاح');
      } else {
        toast.error('فشل الحذف');
      }
    } catch {
      toast.error('خطأ في الشبكة');
    }
  };

  const getProviderMeta = (p: string) =>
    PROVIDERS.find((x) => x.id === p) || { label: p, color: 'bg-muted text-muted-foreground' };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm">مفاتيح الـ API</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={load}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="تحديث"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAdd((s) => !s)}
            className="h-8 text-xs gap-1"
          >
            <Plus className="w-3 h-3" />
            إضافة
          </Button>
        </div>
      </div>

      {/* Security note */}
      <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-2.5 flex items-start gap-2">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          المفاتيح بتتخزّن مشفّرة على السيرفر ومش بتظهر كاملة لأي حد.
        </p>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addKey} className="space-y-2.5 rounded-xl bg-card/60 border border-border/40 p-3">
          <div className="space-y-1">
            <Label className="text-xs">المزوّد</Label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full h-9 rounded-lg bg-background/60 border border-border/50 text-sm px-2"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">المفتاح</Label>
            <Input
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="sk-..."
              dir="ltr"
              className="h-9 rounded-lg bg-background/60 text-sm text-left"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">تسمية (اختياري)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="مثال: حساب العمل"
              className="h-9 rounded-lg bg-background/60 text-sm"
            />
          </div>
          <Button type="submit" disabled={!keyValue.trim() || saving} className="w-full h-9 text-sm">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'حفظ'}
          </Button>
        </form>
      )}

      {/* Keys list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          مفيش مفاتيح مضافة لسه
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => {
            const meta = getProviderMeta(k.provider);
            const isRevealed = revealed[k.id];
            return (
              <div
                key={k.id}
                className="group rounded-xl bg-card/50 border border-border/40 p-2.5"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${meta.color}`}>
                    {meta.label}
                  </span>
                  <button
                    onClick={() => deleteKey(k.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-0.5"
                    aria-label="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {k.label && (
                  <p className="text-xs font-semibold mb-0.5 truncate">{k.label}</p>
                )}
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 text-[11px] text-muted-foreground font-mono truncate" dir="ltr">
                    {isRevealed ? k.maskedKey : k.maskedKey.replace(/./g, '•').slice(0, 12) + '…'}
                  </code>
                  <button
                    onClick={() => setRevealed((r) => ({ ...r, [k.id]: !r[k.id] }))}
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    aria-label="إظهار/إخفاء"
                  >
                    {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

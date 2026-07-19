'use client';

import { useEffect, useState } from 'react';
import { Calendar, CheckSquare, Clock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { authFetch } from '@/lib/auth-fetch';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Reminder {
  id: string;
  title: string;
  dueAt: string;
  done: boolean;
}

/**
 * CalendarTasksWidget — shows today's date + upcoming reminders/tasks.
 * Pulls from /api/reminders (local-first).
 */
export function CalendarTasksWidget() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/reminders');
      if (res.ok) {
        const data = await res.json();
        setReminders(Array.isArray(data) ? data : (data.reminders ?? []));
      }
    } catch (e) {
      console.error('[calendar] load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await authFetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          dueAt: new Date(Date.now() + 3600_000).toISOString(),
        }),
      });
      if (res.ok) {
        setNewTitle('');
        await load();
        toast.success('اتضاف التذكير');
      } else {
        toast.error('فشل إضافة التذكير');
      }
    } catch {
      toast.error('خطأ في الشبكة');
    }
  };

  const toggleDone = async (r: Reminder) => {
    try {
      await authFetch(`/api/reminders/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !r.done }),
      });
      await load();
    } catch {
      toast.error('فشل التحديث');
    }
  };

  const deleteReminder = async (id: string) => {
    try {
      await authFetch(`/api/reminders/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      toast.error('فشل الحذف');
    }
  };

  const now = new Date();
  const todayStr = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Date header */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-fuchsia-500/10 border border-primary/20 p-4">
        <div className="flex items-center gap-2 text-primary">
          <Calendar className="w-5 h-5" />
          <h3 className="font-bold text-sm">اليوم</h3>
        </div>
        <p className="text-lg font-extrabold mt-1">{todayStr}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Add new */}
      <form onSubmit={addReminder} className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="تذكير جديد..."
          className="h-10 rounded-xl bg-background/60 text-sm"
        />
        <Button type="submit" size="icon" className="h-10 w-10 rounded-xl shrink-0">
          <Plus className="w-4 h-4" />
        </Button>
      </form>

      {/* List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5" />
            التذكيرات
          </h4>
          <button
            onClick={load}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="تحديث"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : reminders.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            مفيش تذكيرات دلوقتي
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto scrollbar-thin pr-1">
            {reminders.map((r) => (
              <div
                key={r.id}
                className={`group flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                  r.done
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-card/50 border-border/40 hover:border-primary/30'
                }`}
              >
                <button
                  onClick={() => toggleDone(r)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                    r.done
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-border/60 hover:border-primary'
                  }`}
                  aria-label="تبديل"
                >
                  {r.done && <CheckSquare className="w-3 h-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${r.done ? 'line-through text-muted-foreground' : ''}`}>
                    {r.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(r.dueAt).toLocaleString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => deleteReminder(r.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-1"
                  aria-label="حذف"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

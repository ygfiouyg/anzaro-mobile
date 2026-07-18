'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Trash2, Plus, Clock, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Reminder {
  id: string;
  taskText: string;
  remindAt: string;
  status: string;
}

interface RemindersPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * RemindersPanel — Full UI for the /api/reminders endpoints.
 *
 * Architecture:
 * - Loads reminders on open via GET /api/reminders
 * - Creates reminders via POST /api/reminders
 * - Deletes reminders via DELETE /api/reminders/[id]
 * - Uses useCallback for stable function references (prevents re-renders)
 * - Error handling with toast notifications (no silent failures)
 * - Loading states for every async operation (no UI hangs)
 *
 * Resilience:
 * - If API is unreachable, shows error toast (no crash)
 * - Optimistic delete: removes from UI immediately, restores on error
 * - Date input min set to current time (prevents past reminders)
 */
export function RemindersPanel({ open, onOpenChange }: RemindersPanelProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Load reminders on dialog open ──
  const loadReminders = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('delta-auth-storage');
      const parsed = token ? JSON.parse(token) : null;
      const authToken = parsed?.state?.token;

      const res = await fetch('/api/reminders', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });

      if (!res.ok) throw new Error('فشل تحميل التذكيرات');

      const data = await res.json();
      if (data.success) {
        setReminders(data.reminders || []);
      }
    } catch {
      toast.error('فشل تحميل التذكيرات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadReminders();
    }
  }, [open, loadReminders]);

  // ── Create reminder ──
  const handleCreate = async () => {
    if (!taskText.trim() || !remindAt) {
      toast.error('يرجى إدخال النص والتاريخ');
      return;
    }

    setCreating(true);
    try {
      const token = localStorage.getItem('delta-auth-storage');
      const parsed = token ? JSON.parse(token) : null;
      const authToken = parsed?.state?.token;

      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ taskText: taskText.trim(), remindAt }),
      });

      if (!res.ok) throw new Error('فشل إنشاء التذكير');

      const data = await res.json();
      if (data.success) {
        setReminders((prev) =>
          [...prev, data.reminder].sort(
            (a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime()
          )
        );
        setTaskText('');
        setRemindAt('');
        toast.success('تم إنشاء التذكير بنجاح');
      }
    } catch {
      toast.error('فشل إنشاء التذكير');
    } finally {
      setCreating(false);
    }
  };

  // ── Delete reminder (optimistic) ──
  const handleDelete = async (id: string) => {
    // Optimistic: remove from UI immediately
    const previous = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(id);

    try {
      const token = localStorage.getItem('delta-auth-storage');
      const parsed = token ? JSON.parse(token) : null;
      const authToken = parsed?.state?.token;

      const res = await fetch(`/api/reminders/${id}`, {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });

      if (!res.ok) throw new Error('فشل حذف التذكير');

      toast.success('تم حذف التذكير');
    } catch {
      // Restore on error
      setReminders(previous);
      toast.error('فشل حذف التذكير');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Format date for display ──
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('ar-EG', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // ── Min datetime = now (prevent past reminders) ──
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDateTime = now.toISOString().slice(0, 16);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="size-5 text-primary" />
            التذكيرات
          </DialogTitle>
          <DialogDescription>
            أنشئ تذكيرات وسيتم إرسالها لك عبر البريد الإلكتروني
          </DialogDescription>
        </DialogHeader>

        {/* Create form */}
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reminder-text">نص التذكير</Label>
            <Input
              id="reminder-text"
              placeholder="مثال: اجتماع مهم الساعة 3"
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reminder-date">وقت التذكير</Label>
            <Input
              id="reminder-date"
              type="datetime-local"
              min={minDateTime}
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              disabled={creating}
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating || !taskText.trim() || !remindAt}
            className="w-full"
          >
            {creating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                جاري الإنشاء...
              </>
            ) : (
              <>
                <Plus className="size-4" />
                إنشاء تذكير
              </>
            )}
          </Button>
        </div>

        {/* Reminders list */}
        <div className="border-t pt-3">
          <Label className="mb-2 block">التذكيرات الحالية</Label>
          <ScrollArea className="h-[200px] rounded-lg border border-border p-2">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : reminders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <Bell className="size-8 opacity-50" />
                <p className="text-sm">لا توجد تذكيرات</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className="flex items-start gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground break-words">
                        {reminder.taskText}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Clock className="size-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {formatDate(reminder.remindAt)}
                        </span>
                        {reminder.status === 'SENT' && (
                          <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle2 className="size-3" />
                            تم الإرسال
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(reminder.id)}
                      disabled={deletingId === reminder.id}
                      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      aria-label="حذف"
                    >
                      {deletingId === reminder.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Brain, Trash2, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/store/auth-store';

// ─── Category Labels (duplicated here to avoid importing server-only code) ──
const CATEGORY_LABELS: Record<string, string> = {
  style: 'أسلوب الكتابة',
  interest: 'الاهتمامات',
  language: 'اللغة',
  preference: 'التفضيلات',
};

interface MemoryItem {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  sourceCount: number;
  updatedAt: string;
}

interface UserMemoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  interest: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  language: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  preference: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
};

const CATEGORY_ICONS: Record<string, string> = {
  style: '✍️',
  interest: '💡',
  language: '🌐',
  preference: '⚙️',
};

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'عالية';
  if (confidence >= 0.5) return 'متوسطة';
  return 'منخفضة';
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-blue-600 dark:text-blue-400';
  if (confidence >= 0.5) return 'text-blue-600 dark:text-blue-400';
  return 'text-red-500 dark:text-red-400';
}

export function UserMemoryPanel({ open, onOpenChange }: UserMemoryPanelProps) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { token, isAuthenticated } = useAuthStore();

  const fetchMemories = useCallback(async () => {
    if (!token || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/user/memory', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('فشل في تحميل الذاكرة');
      const data = await res.json();
      setMemories(data.memories || []);
    } catch {
      setError('حدث خطأ أثناء تحميل الذاكرة');
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated]);

  useEffect(() => {
    if (open) {
      fetchMemories();
    }
  }, [open, fetchMemories]);

  const handleDelete = async (memoryId: string) => {
    if (!token) return;
    setDeleting(memoryId);
    try {
      const res = await fetch('/api/user/memory', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ memoryId }),
      });
      if (!res.ok) throw new Error('فشل في حذف الذاكرة');
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    } catch {
      setError('حدث خطأ أثناء حذف الذاكرة');
    } finally {
      setDeleting(null);
    }
  };

  const handleClearAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/user/memory', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clearAll: true }),
      });
      if (!res.ok) throw new Error('فشل في مسح كل الذاكرة');
      setMemories([]);
    } catch {
      setError('حدث خطأ أثناء مسح الذاكرة');
    } finally {
      setLoading(false);
    }
  };

  // Group memories by category
  const grouped = memories.reduce<Record<string, MemoryItem[]>>((acc, m) => {
    const cat = m.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  const categoryOrder = ['language', 'style', 'interest', 'preference'];
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Brain className="size-5 text-blue-600 dark:text-blue-400" />
            الذاكرة الذكية
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            ما يتذكره المساعد عنك عبر المحادثات — أسلوبك واهتماماتك ولغتك وتفضيلاتك
          </DialogDescription>
        </DialogHeader>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs">
            <AlertTriangle className="size-3.5 flex-shrink-0" />
            {error}
            <Button variant="ghost" size="icon" className="size-5 mr-auto" onClick={() => setError(null)}>
              <X className="size-3" />
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && memories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Loader2 className="size-6 animate-spin text-blue-600" />
            <span className="text-xs text-muted-foreground">جاري تحميل الذاكرة...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && memories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Brain className="size-10 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">لا توجد ذكريات بعد</p>
              <p className="text-xs text-muted-foreground mt-1">
                ابدأ محادثة وسيبدأ المساعد بتعلم تفضيلاتك تلقائيًا
              </p>
            </div>
          </div>
        )}

        {/* Memories List */}
        {memories.length > 0 && (
          <ScrollArea className="flex-1 max-h-[55vh] -mx-2 px-2">
            <div className="space-y-4 py-1">
              {sortedCategories.map((category) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <span>{CATEGORY_ICONS[category] || '📌'}</span>
                    {CATEGORY_LABELS[category] || category}
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {grouped[category].length}
                    </Badge>
                  </h3>
                  <div className="space-y-1.5">
                    {grouped[category].map((memory) => (
                      <div
                        key={memory.id}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-accent transition-colors group"
                      >
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 h-5 whitespace-nowrap ${CATEGORY_COLORS[memory.category] || ''}`}
                        >
                          {memory.key.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-xs flex-1 truncate" title={memory.value}>
                          {memory.value}
                        </span>

                        {/* Confidence indicator */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Progress
                            value={memory.confidence * 100}
                            className="h-1 w-10"
                          />
                          <span className={`text-[9px] font-medium ${getConfidenceColor(memory.confidence)}`}>
                            {getConfidenceLabel(memory.confidence)}
                          </span>
                        </div>

                        {/* Delete button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                          onClick={() => handleDelete(memory.id)}
                          disabled={deleting === memory.id}
                          aria-label="حذف"
                        >
                          {deleting === memory.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Footer with Clear All */}
        {memories.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-[10px] text-muted-foreground">
              {memories.length} ذاكرة
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  disabled={loading}
                >
                  <Trash2 className="size-3 ml-1" />
                  مسح الكل
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>مسح كل الذاكرة؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حذف كل ما تعلمه المساعد عنك من تفضيلات وأساليب واهتمامات.
                    هذا الإجراء لا يمكن التراجع عنه.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearAll}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    مسح الكل
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

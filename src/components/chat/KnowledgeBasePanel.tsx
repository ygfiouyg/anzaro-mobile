'use client';

import { useState, useCallback } from 'react';
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
import { BookOpen, Search, Loader2, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface KnowledgeBasePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RAGResult {
  content: string;
  score: number;
  source: string;
  metadata?: Record<string, unknown>;
}

interface RAGResponse {
  hasContext: boolean;
  results?: RAGResult[];
  context?: string;
  error?: string;
}

/**
 * KnowledgeBasePanel — Connects the orphan /api/rag/query API to the UI.
 *
 * Architecture:
 * - POST /api/rag/query with { conversationId, query }
 * - Returns relevant knowledge chunks from the RAG store
 * - Results displayed with relevance score + source
 * - Uses current active conversation ID from chat-store
 *
 * Resilience:
 * - 30s timeout via AbortController
 * - Graceful "no context" state (not an error)
 * - Error handling with toast
 */
export function KnowledgeBasePanel({ open, onOpenChange }: KnowledgeBasePanelProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RAGResult[] | null>(null);
  const [hasContext, setHasContext] = useState<boolean | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      toast.error('يرجى إدخال استعلام البحث');
      return;
    }

    setLoading(true);
    setResults(null);
    setHasContext(null);

    try {
      const token = localStorage.getItem('delta-auth-storage');
      const parsed = token ? JSON.parse(token) : null;
      const authToken = parsed?.state?.token;

      // Use a static conversation ID for standalone queries
      const conversationId = 'knowledge-base-query';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch('/api/rag/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          conversationId,
          query: query.trim(),
          topK: 8,
          language: 'ar',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `خطأ: ${response.status}`);
      }

      const data: RAGResponse = await response.json();
      setHasContext(data.hasContext);

      if (data.hasContext && data.results) {
        setResults(data.results);
        toast.success(`تم العثور على ${data.results.length} نتيجة`);
      } else {
        setResults([]);
        toast.info('لا توجد معرفة مخزنة لهذا الاستعلام بعد');
      }
    } catch (err) {
      const message = err instanceof Error
        ? err.name === 'AbortError'
          ? 'انتهت مهلة البحث'
          : err.message
        : 'فشل الاتصال بالخادم';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setQuery('');
      setResults(null);
      setHasContext(null);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            قاعدة المعرفة
          </DialogTitle>
          <DialogDescription>
            ابحث في المعرفة المخزنة من محادثاتك السابقة والمستندات المرفوعة
          </DialogDescription>
        </DialogHeader>

        {/* Search form */}
        <div className="flex gap-2 py-2">
          <Input
            placeholder="ابحث عن معلومة..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading || !query.trim()}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
          </Button>
        </div>

        {/* Results */}
        {results !== null && (
          <div className="border-t pt-3">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
                <AlertCircle className="size-8" />
                <p className="text-sm">
                  {hasContext === false
                    ? 'لا توجد معرفة مخزنة. ارفع مستندات في المحادثة لبناء قاعدة المعرفة.'
                    : 'لا توجد نتائج مطابقة'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[300px] rounded-lg border border-border p-3">
                <div className="space-y-3">
                  {results.map((result, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-card p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <FileText className="size-3" />
                          {result.source || 'مصدر غير معروف'}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {(result.score * 100).toFixed(1)}% تطابق
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {result.content}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

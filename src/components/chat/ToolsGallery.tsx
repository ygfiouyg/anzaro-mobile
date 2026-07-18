'use client';

import { useState, useMemo } from 'react';
import {
  X,
  Search,
  ChevronDown,
  ChevronLeft,
  Wrench,
  MessageSquare,
  Upload,
  Code2,
  Play,
  Clipboard,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TOOL_CATALOG,
  TOOL_CATEGORIES,
  getToolsStats,
  type AIToolEntry,
  type ToolCategory,
} from '@/lib/ai-tools/catalog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ToolsGalleryProps {
  isOpen: boolean;
  onClose: () => void;
}

/** خريطة ألوان لكل فئة (نفس نظام AIToolsHub) */
const CATEGORY_COLOR_CLASSES: Record<string, string> = {
  indigo: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  amber: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  violet: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  emerald: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  sky: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  teal: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  orange: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  rose: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  cyan: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  fuchsia: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
};

/** خصائص الـ status badge */
function StatusBadge({ status }: { status: AIToolEntry['status'] }) {
  if (status === 'chat') {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
      >
        <MessageSquare className="w-3 h-3" /> متاحة بالشات
      </Badge>
    );
  }
  if (status === 'upload') {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
      >
        <Upload className="w-3 h-3" /> رفع ملف
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] gap-1 border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400"
    >
      <Code2 className="w-3 h-3" /> API فقط
    </Badge>
  );
}

/** بطاقة أداة واحدة */
function ToolCard({ tool }: { tool: AIToolEntry }) {
  const [expanded, setExpanded] = useState(false);
  const category = TOOL_CATEGORIES.find((c) => c.id === tool.category);
  const colorClass = CATEGORY_COLOR_CLASSES[category?.color || 'sky'] || CATEGORY_COLOR_CLASSES.sky;

  const handleTry = async () => {
    if (!tool.patterns || tool.patterns.length === 0) {
      if (tool.status === 'upload') {
        toast.info('الأداة دي محتاجة رفع ملف من الشات', {
          description: 'افتح الشات وارفع الملف واسأل عليه',
        });
      } else if (tool.status === 'api-only') {
        toast.info('الأداة دي متاحة عبر API فقط', {
          description: tool.apiEndpoint ? `الـ endpoint: ${tool.apiEndpoint}` : undefined,
        });
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(tool.patterns[0]);
      toast.success('تم نسخ النمط! الصق في الشات للتجربة', {
        description: tool.patterns[0],
      });
    } catch {
      // fallback إذا لم يتوفر clipboard
      toast.error('تعذّر النسخ — انسخ يدوياً', {
        description: tool.patterns[0],
      });
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-3 rounded-lg border transition-all hover:shadow-md ${colorClass}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-xl flex-shrink-0 leading-none mt-0.5">
          {category?.icon || '🛠️'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-sm text-foreground truncate">{tool.name}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-2">
            {tool.description}
          </p>

          <div className="flex items-center gap-1 mb-2 flex-wrap">
            <StatusBadge status={tool.status} />
          </div>

          {/* patterns — collapsible */}
          {tool.patterns && tool.patterns.length > 0 && (
            <div className="mb-2">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronLeft className="w-3 h-3" />
                )}
                إزاي تستدعيها
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden mt-1 space-y-1"
                  >
                    {tool.patterns.slice(0, 3).map((p, i) => (
                      <li
                        key={i}
                        dir="rtl"
                        className="text-[11px] font-mono bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded border border-blue-200 dark:border-blue-700"
                      >
                        {p}
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* API endpoint info for api-only */}
          {tool.status === 'api-only' && tool.apiEndpoint && (
            <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 mb-2 muted px-2 py-0.5 rounded">
              {tool.apiEndpoint}
            </div>
          )}

          {/* Try button */}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleTry}
            className="h-7 text-[11px] gap-1 w-full"
          >
            {tool.status === 'chat' && tool.patterns && tool.patterns.length > 0 ? (
              <>
                <Play className="w-3 h-3" /> جرّبها
              </>
            ) : tool.status === 'upload' ? (
              <>
                <Upload className="w-3 h-3" /> كيف أستخدمها
              </>
            ) : (
              <>
                <Clipboard className="w-3 h-3" /> تفاصيل API
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export function ToolsGallery({ isOpen, onClose }: ToolsGalleryProps) {
  const [activeCategory, setActiveCategory] = useState<ToolCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const stats = useMemo(() => getToolsStats(), []);

  const filteredTools = useMemo(() => {
    let result: AIToolEntry[] = TOOL_CATALOG;

    if (activeCategory !== 'all') {
      result = result.filter((t) => t.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.patterns || []).some((p) => p.toLowerCase().includes(q))
      );
    }

    return result;
  }, [activeCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="w-[340px] border-l border-border/60 dark:border-white/10 bg-card bg-gradient-to-br from-card via-card to-muted/30 flex flex-col h-full overflow-hidden shadow-2xl shadow-blue-900/20 dark:shadow-blue-950/40"
      dir="rtl"
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-lg flex items-center gap-2 text-foreground">
            <Wrench className="w-5 h-5 text-blue-500" />
            أدوات Anzaro AI الذكية
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats Badge */}
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 mb-3">
          <span className="px-1.5 py-0.5 rounded bg-blue-500 text-blue-600 dark:text-blue-400 font-semibold">
            {stats.total} أداة
          </span>
          <span>·</span>
          <span className="px-1.5 py-0.5 rounded bg-blue-500 text-blue-600 dark:text-blue-400">
            {stats.chatConnected} مربوطة بالشات
          </span>
          <span>·</span>
          <span className="px-1.5 py-0.5 rounded bg-blue-500 text-blue-600 dark:text-blue-400">
            {stats.uploadRequired} رفع ملفات
          </span>
          <span>·</span>
          <span className="px-1.5 py-0.5 rounded bg-blue-500 text-gray-600 dark:text-gray-400">
            {stats.apiOnly} API فقط
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="ابحث عن أداة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 text-sm"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
            activeCategory === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          الكل ({TOOL_CATALOG.length})
        </button>
        {TOOL_CATEGORIES.map((cat) => {
          const count = TOOL_CATALOG.filter((t) => t.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {cat.icon} {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Tools List */}
      <ScrollArea className="flex-1 min-h-0 p-3">
        <div className="space-y-2">
          {filteredTools.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>لا توجد أدوات مطابقة</p>
            </div>
          ) : (
            filteredTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)
          )}
        </div>
      </ScrollArea>

      {/* Footer Stats */}
      <div className="p-3 border-t border-border text-center">
        <p className="text-xs text-gray-400">
          عرض {filteredTools.length} من أصل {TOOL_CATALOG.length} أداة
        </p>
      </div>
    </div>
  );
}

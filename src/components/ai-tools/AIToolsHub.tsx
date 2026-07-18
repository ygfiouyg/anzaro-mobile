'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Loader2, Sparkles, ChevronDown, ChevronRight, Play, X,
  Type, Image as ImageIcon, Link2, FileText, Code2, Mic,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Tool {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  description: string;
  source: string;
  inputType: string;
  outputType: string;
  difficulty: string;
}

interface ToolCategory {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  amber: 'border-blue-500 bg-blue-500 text-blue-600 dark:text-blue-300',
  sky: 'border-blue-500 bg-blue-500 text-blue-600 dark:text-blue-300',
  emerald: 'border-blue-500 bg-blue-500 text-blue-600 dark:text-blue-300',
  rose: 'border-blue-500 bg-blue-500 text-blue-600 dark:text-blue-300',
  violet: 'border-blue-500 bg-blue-500 text-blue-600 dark:text-blue-300',
  teal: 'border-blue-500 bg-blue-500 text-blue-600 dark:text-blue-300',
  indigo: 'border-blue-500 bg-blue-500 text-blue-600 dark:text-blue-300',
  orange: 'border-blue-500 bg-blue-500 text-blue-600 dark:text-blue-300',
  fuchsia: 'border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-300',
};

const INPUT_ICONS: Record<string, typeof Type> = {
  text: Type,
  image: ImageIcon,
  url: Link2,
  file: FileText,
  audio: Mic,
  code: Code2,
};

export function AIToolsHub() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<ToolCategory[]>([]);
  const [search, setSearch] = useState('');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [stats, setStats] = useState({ total: 0, categories: 0 });

  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      const [toolsRes, statsRes] = await Promise.all([
        fetch('/api/ai/tools'),
        fetch('/api/ai/tools?stats=true'),
      ]);
      const toolsData = await toolsRes.json();
      const statsData = await statsRes.json();
      setTools(toolsData.tools || []);
      setCategories(toolsData.categories || []);
      setStats(statsData);
    } catch {
      toast.error('فشل تحميل الأدوات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  const filtered = search.trim()
    ? tools.filter(t =>
        t.name.includes(search) ||
        t.nameEn.toLowerCase().includes(search.toLowerCase()) ||
        t.description.includes(search) ||
        t.source.toLowerCase().includes(search.toLowerCase())
      )
    : tools;

  const byCategory = (catId: string) => filtered.filter(t => t.category === catId);

  const handleRun = async () => {
    if (!selectedTool || !input.trim()) {
      toast.error('اكتب المدخلات');
      return;
    }
    setRunning(true);
    setOutput('');
    try {
      // مفيش timeout — خلي الـ fetch مفتوح لحد ما يرد
      const res = await fetch('/api/ai/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: selectedTool.id,
          input: { text: input, url: input, code: input },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOutput(data.output);
        toast.success(`أداة ${data.toolName} اشتغلت!`);
      } else {
        toast.error('فشل: ' + (data.error || ''));
        setOutput('❌ خطأ: ' + (data.error || ''));
      }
    } catch (e: any) {
      toast.error('خطأ: ' + e.message);
      setOutput('❌ خطأ: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full" dir="rtl">
      {/* Sidebar */}
      <div className="w-80 shrink-0 border-l border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">AI Tools Hub</h3>
              <p className="text-[10px] text-muted-foreground">{stats.total} أداة في {stats.categories} فئات</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث في 97 أداة..."
              className="h-8 pr-8 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              </div>
            ) : (
              categories.map(cat => {
                const catTools = byCategory(cat.id);
                if (catTools.length === 0) return null;
                const isExpanded = expandedCat === cat.id || !!search.trim();
                const colorClass = CATEGORY_COLORS[cat.color] || CATEGORY_COLORS.indigo;
                return (
                  <div key={cat.id} className="mb-1">
                    <button
                      onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors"
                    >
                      <span className="text-base">{cat.icon}</span>
                      <span className="text-xs font-semibold flex-1 text-right">{cat.name}</span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{catTools.length}</Badge>
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                    {isExpanded && (
                      <div className="mr-4 mt-0.5 space-y-0.5">
                        {catTools.map(tool => {
                          const InputIcon = INPUT_ICONS[tool.inputType] || Type;
                          const isSelected = selectedTool?.id === tool.id;
                          return (
                            <button
                              key={tool.id}
                              onClick={() => { setSelectedTool(tool); setOutput(''); }}
                              className={cn(
                                'group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-right transition-colors',
                                isSelected ? 'bg-blue-500 border border-blue-500' : 'hover:bg-accent'
                              )}
                            >
                              <InputIcon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate">{tool.name}</div>
                                <div className="text-[9px] text-muted-foreground truncate">{tool.description}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedTool ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-500 mb-4">
                <Sparkles className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-base font-bold mb-1">AI Tools Hub — {stats.total} أداة</h3>
              <p className="text-xs text-muted-foreground mb-4">
                اختر أداة من القائمة لتشغيلها. كل الأدوات بتشتغل بـ GLM-5.2.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border bg-muted p-2">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-300">{stats.total}</div>
                  <div className="text-[10px] text-muted-foreground">أداة</div>
                </div>
                <div className="rounded-lg border border-border bg-muted p-2">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-300">{stats.categories}</div>
                  <div className="text-[10px] text-muted-foreground">فئة</div>
                </div>
                <div className="rounded-lg border border-border bg-muted p-2">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-300">GLM-5.2</div>
                  <div className="text-[10px] text-muted-foreground">المحرك</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tool header */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 bg-muted">
              <span className="text-lg">{categories.find(c => c.id === selectedTool.category)?.icon}</span>
              <div className="flex-1">
                <h3 className="text-sm font-bold">{selectedTool.name}</h3>
                <p className="text-[10px] text-muted-foreground">{selectedTool.description}</p>
              </div>
              <Badge variant="outline" className="text-[9px]">{selectedTool.source}</Badge>
              <button onClick={() => setSelectedTool(null)} className="rounded p-1 hover:bg-accent">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Input */}
            <div className="p-4 border-b border-border">
              <label className="text-xs font-semibold mb-1.5 block">المدخلات ({selectedTool.inputType})</label>
              {selectedTool.inputType === 'text' || selectedTool.inputType === 'code' ? (
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="اكتب هنا..."
                  className="w-full min-h-[100px] max-h-[200px] rounded-lg border border-border bg-muted p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="rtl"
                />
              ) : selectedTool.inputType === 'url' ? (
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="https://..."
                  className="text-sm font-mono"
                  dir="ltr"
                />
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  ارفع {selectedTool.inputType} — استخدم الـ API مباشرة
                </div>
              )}
              <Button
                onClick={handleRun}
                disabled={running || !input.trim()}
                className="mt-2 w-full bg-gradient-to-br from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700"
              >
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {running ? 'جاري التشغيل...' : 'تشغيل الأداة'}
              </Button>
            </div>

            {/* Output */}
            {output && (
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {/* لو الـ output فيه URL للفيديو */}
                  {output.includes('.mp4') && (
                    <div className="mb-4 rounded-lg overflow-hidden border border-border">
                      <video
                        src={output.match(/https?:\/\/[^\s"']+\.mp4/)?.[0] || ''}
                        controls
                        className="w-full max-h-[400px]"
                        preload="metadata"
                      />
                    </div>
                  )}
                  {/* لو الـ output فيه URL لصورة */}
                  {output.match(/\.(png|jpg|jpeg|gif|webp)/i) && !output.includes('.mp4') && (
                    <div className="mb-4 rounded-lg overflow-hidden border border-border max-w-md">
                      <img
                        src={output.match(/https?:\/\/[^\s"']+\.(png|jpg|jpeg|gif|webp)/i)?.[0] || ''}
                        alt="generated"
                        className="w-full h-auto"
                      />
                    </div>
                  )}
                  {/* النص العادي */}
                  <pre className="text-xs whitespace-pre-wrap leading-relaxed" dir="auto">{output}</pre>
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </div>
    </div>
  );
}

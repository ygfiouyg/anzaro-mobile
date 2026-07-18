'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Loader2, Sparkles, Play, X, Globe, FileText, Image as ImageIcon,
  Code2, Brain, ChevronRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MCPTool {
  id: string;
  name: string;
  description: string;
  inputType: 'text' | 'url' | 'code';
  placeholder: string;
  source: string;
}

const TOOL_ICONS: Record<string, typeof Globe> = {
  'mcp-web-search': Search,
  'mcp-page-reader': FileText,
  'mcp-image-search': ImageIcon,
  'mcp-code-exec': Code2,
  'mcp-memory': Brain,
};

const TOOL_COLORS: Record<string, string> = {
  'mcp-web-search': 'from-blue-500 to-blue-600',
  'mcp-page-reader': 'from-blue-500 to-blue-600',
  'mcp-image-search': 'from-blue-500 to-blue-600',
  'mcp-code-exec': 'from-blue-500 to-blue-600',
  'mcp-memory': 'from-blue-500 to-blue-600',
};

export function MCPHub() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [outputType, setOutputType] = useState('text');
  const [loading, setLoading] = useState(true);

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/mcp');
      const data = await res.json();
      setTools(data.tools || []);
    } catch {
      // fallback لـ tools محلية
      setTools([
        { id: 'mcp-web-search', name: '🔍 بحث ويب MCP', description: 'بحث حقيقي في الإنترنت', inputType: 'text', placeholder: 'اكتب استعلام البحث...', source: 'cursor_linkup_mcp' },
        { id: 'mcp-page-reader', name: '📄 قارئ صفحات MCP', description: 'قراءة محتوى أي صفحة ويب', inputType: 'url', placeholder: 'https://example.com', source: 'llamaindex-mcp' },
        { id: 'mcp-image-search', name: '🖼️ بحث صور MCP', description: 'بحث عن صور في الإنترنت', inputType: 'text', placeholder: 'وصف الصورة...', source: 'pixeltable-mcp' },
        { id: 'mcp-code-exec', name: '💻 تنفيذ كود MCP', description: 'تنفيذ JavaScript في sandbox', inputType: 'code', placeholder: 'console.log("Hello")', source: 'art_mcp_rl' },
        { id: 'mcp-memory', name: '🧠 ذاكرة MCP', description: 'حفظ واسترجاع معلومات', inputType: 'text', placeholder: 'save|key|value', source: 'graphiti-mcp' },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  const handleRun = async () => {
    if (!selectedTool || !input.trim()) {
      toast.error('اكتب المدخلات');
      return;
    }
    setRunning(true);
    setOutput('');
    try {
      const res = await fetch('/api/ai/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: selectedTool.id, input: input.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setOutput(data.output);
        setOutputType(data.outputType || 'text');
        toast.success(`${selectedTool.name} اشتغلت!`);
      } else {
        setOutput('❌ خطأ: ' + (data.error || 'فشل'));
        toast.error(data.error || 'فشل');
      }
    } catch (e: any) {
      setOutput('❌ خطأ: ' + e.message);
      toast.error('خطأ: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  const handleSelectTool = (tool: MCPTool) => {
    setSelectedTool(tool);
    setInput('');
    setOutput('');
  };

  return (
    <div className="flex h-full" dir="rtl">
      {/* Sidebar — قائمة الأدوات */}
      <div className="w-64 shrink-0 border-l border-border flex flex-col bg-muted">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">MCP Tools</h3>
              <p className="text-[10px] text-muted-foreground">{tools.length} أدوات حقيقية</p>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              </div>
            ) : (
              tools.map(tool => {
                const Icon = TOOL_ICONS[tool.id] || Globe;
                const color = TOOL_COLORS[tool.id] || 'from-slate-500 to-slate-600';
                const isSelected = selectedTool?.id === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => handleSelectTool(tool)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg p-2 text-right transition-all',
                      isSelected ? 'bg-blue-500 border border-blue-500' : 'hover:bg-accent'
                    )}
                  >
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br', color)}>
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{tool.name}</div>
                      <div className="text-[9px] text-muted-foreground line-clamp-2">{tool.description}</div>
                    </div>
                  </button>
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
              <h3 className="text-base font-bold mb-1">MCP Tools — أدوات حقيقية</h3>
              <p className="text-xs text-muted-foreground mb-4">
                دي أدوات MCP حقيقية بتعمل function calls فعلية — مش مجرد prompts.
                كل أداة بترجع نتائج حقيقية.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {tools.map(tool => {
                  const Icon = TOOL_ICONS[tool.id] || Globe;
                  const color = TOOL_COLORS[tool.id] || 'from-slate-500 to-slate-600';
                  return (
                    <button
                      key={tool.id}
                      onClick={() => handleSelectTool(tool)}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2.5 hover:bg-accent transition-colors text-right"
                    >
                      <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gradient-to-br', color)}>
                        <Icon className="h-3 w-3 text-white" />
                      </div>
                      <span className="text-[11px] font-medium truncate">{tool.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tool header */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 bg-muted">
              <button onClick={() => setSelectedTool(null)} className="rounded p-1 hover:bg-accent">
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="flex-1">
                <h3 className="text-sm font-bold">{selectedTool.name}</h3>
                <p className="text-[10px] text-muted-foreground">{selectedTool.description}</p>
              </div>
              <Badge variant="outline" className="text-[9px]">{selectedTool.source}</Badge>
            </div>

            {/* Input */}
            <div className="p-4 border-b border-border">
              <label className="text-xs font-semibold mb-1.5 block">
                المدخلات ({selectedTool.inputType})
              </label>
              {selectedTool.inputType === 'code' ? (
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={selectedTool.placeholder}
                  className="w-full min-h-[120px] max-h-[250px] rounded-lg border border-border bg-muted p-3 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              ) : (
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={selectedTool.placeholder}
                  className="text-sm"
                  dir={selectedTool.inputType === 'url' ? 'ltr' : 'rtl'}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRun(); } }}
                />
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
                  {/* لو فيه صور */}
                  {outputType === 'images' && output.match(/https?:\/\/[^\s]+/g) && (
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      {output.match(/https?:\/\/[^\s]+/g)!.slice(0, 4).map((url, i) => (
                        <div key={i} className="rounded-lg overflow-hidden border border-border">
                          <img src={url} alt={`result ${i}`} className="w-full h-32 object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                  {/* النص */}
                  <pre className="text-xs whitespace-pre-wrap leading-relaxed font-mono" dir="auto">{output}</pre>
                </div>
              </ScrollArea>
            )}

            {/* Loading state */}
            {running && !output && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">جاري تشغيل الأداة...</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

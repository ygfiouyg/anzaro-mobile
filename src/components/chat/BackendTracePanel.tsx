'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Trash2, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TRACE_CATEGORIES, type TraceEntry } from '@/lib/trace-logger';

export function BackendTracePanel() {
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE
  useEffect(() => {
    const eventSource = new EventSource('/api/trace/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'history') {
          setEntries(data.entries || []);
        } else if (data.type === 'heartbeat') {
          // Heartbeat received, connection is alive
          setIsConnected(true);
        } else {
          // New trace entry
          setEntries((prev) => {
            const newEntries = [...prev, data];
            if (newEntries.length > 200) {
              return newEntries.slice(-200);
            }
            return newEntries;
          });
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      // Reconnect after 5 seconds
      eventSource.close();
      setTimeout(() => {
        // Reconnect will happen via effect cleanup
      }, 5000);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const handleClear = useCallback(async () => {
    try {
      await fetch('/api/trace/events', { method: 'DELETE' });
      setEntries([]);
    } catch {
      // Ignore
    }
  }, []);

  const filteredEntries = activeFilter
    ? entries.filter((e) => e.category === activeFilter)
    : entries;

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-500 bg-red-50 dark:bg-red-950';
      case 'warn': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950';
      case 'success': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950';
      default: return 'text-foreground muted';
    }
  };

  const getCategoryColor = (category: string) => {
    const cat = TRACE_CATEGORIES.find((c) => c.id === category);
    return cat?.color || '#64748b';
  };

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-blue-500" />
          <h3 className="text-sm font-semibold">تتبع النظام</h3>
          <Badge
            variant={isConnected ? 'default' : 'secondary'}
            className={`text-[9px] px-1.5 ${
              isConnected
                ? 'bg-blue-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {isConnected ? 'متصل' : 'غير متصل'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" onClick={handleClear}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Filter className="size-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">تصفية حسب الفئة</span>
          {activeFilter && (
            <Button
              variant="ghost"
              size="icon"
              className="size-4 p-0"
              onClick={() => setActiveFilter(null)}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {TRACE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveFilter(activeFilter === cat.id ? null : cat.id)}
              className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${
                activeFilter === cat.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground'
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trace Entries */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-2 space-y-0.5">
          {filteredEntries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="size-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">لا توجد سجلات حتى الآن</p>
            </div>
          )}
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className={`p-2 rounded-md text-xs ${getLevelColor(entry.level)} transition-colors`}
            >
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0">{entry.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Badge
                      variant="outline"
                      className="text-[8px] px-1 py-0 border-0"
                      style={{ backgroundColor: getCategoryColor(entry.category) + '20', color: getCategoryColor(entry.category) }}
                    >
                      {entry.category}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground font-mono" dir="ltr">
                      {new Date(entry.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed break-words">{entry.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t border-border text-center">
        <span className="text-[10px] text-muted-foreground">
          {filteredEntries.length} سجل {activeFilter ? `(مصفى)` : ''}
        </span>
      </div>
    </div>
  );
}

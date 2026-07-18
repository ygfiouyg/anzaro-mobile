'use client';

import { useState, useCallback } from 'react';
import { Search, X, ExternalLink, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  content?: string;
}

interface SearchBarProps {
  onInsertResult?: (result: string) => void;
  onClose?: () => void;
}

export function SearchBar({ onInsertResult, onClose }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleInsert = (result: SearchResult) => {
    if (onInsertResult) {
      const text = result.snippet || result.content || result.title || '';
      onInsertResult(text);
    }
  };

  return (
    <Card className="border-blue-500 shadow-lg">
      <CardContent className="p-3">
        {/* Search Input */}
        <div className="flex items-center gap-2 mb-3">
          <Search className="size-4 text-blue-500 flex-shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ابحث في الويب..."
            className="border-0 focus-visible:ring-0 p-0 h-8 text-sm"
            dir="auto"
            autoFocus
          />
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
            className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black h-8 px-3"
          >
            {isSearching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              'بحث'
            )}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
              <X className="size-4" />
            </Button>
          )}
        </div>

        {/* Results */}
        {isSearching && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">جاري البحث...</span>
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="size-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لم يتم العثور على نتائج</p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {results.map((result, i) => (
              <div
                key={i}
                className="p-2.5 rounded-lg border border-border hover:border-blue-500 hover:bg-accent transition-colors cursor-pointer"
                onClick={() => handleInsert(result)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground truncate">
                      {result.title || 'بدون عنوان'}
                    </h4>
                    {result.snippet && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2" dir="auto">
                        {result.snippet}
                      </p>
                    )}
                    {result.url && (
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 truncate" dir="ltr">
                        {result.url}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                      نتيجة
                    </Badge>
                    {result.url && (
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 hover:text-blue-500 transition-colors"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasSearched && (
          <p className="text-xs text-muted-foreground text-center py-4">
            اضغط Enter أو زر البحث للبحث في الويب
          </p>
        )}
      </CardContent>
    </Card>
  );
}
